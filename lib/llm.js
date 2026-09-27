'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const spinner = require('./spinner');
const ui = require('./ui');
const trace = require('./trace');

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const HF_BASE_URL   = process.env.HF_BASE_URL ||
  'https://router.huggingface.co/hf-inference/models';

const DEFAULT_GEN_MODEL   = 'openai/gpt-oss-120b';

const DEFAULT_EMBED_MODEL = 'BAAI/bge-small-en-v1.5';

const ROUTE_PROMPT_FILE = path.join(__dirname, '..', 'templates', 'prompts', 'route.md');

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 120000;
const MAX_ATTEMPTS       = Number(process.env.LLM_MAX_ATTEMPTS) || 4;
const RETRY_BASE_MS      = 1000;
const RETRY_MAX_MS       = 20000;
const ERROR_BODY_CHARS   = 300;
const TPM_LIMIT     = Number(process.env.LLM_TPM_LIMIT) || 8000;
const TPM_WINDOW_MS = 60 * 1000;
const CHARS_PER_TOKEN = 3;
const spendByScope = new Map();

function ledgerFor(scope) {
  if (!spendByScope.has(scope)) spendByScope.set(scope, []);
  return spendByScope.get(scope);
}

function spentInWindow(scope, now) {
  const ledger = ledgerFor(scope);
  while (ledger.length && now - ledger[0].ts >= TPM_WINDOW_MS) ledger.shift();
  return ledger.reduce((sum, h) => sum + h.tokens, 0);
}

function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

function reserve(scope, tokens, now) {
  const entry = { ts: now, tokens, planned: true };
  ledgerFor(scope).push(entry);
  return entry;
}

function releaseReservation(scope, entry) {
  if (!entry) return;
  const ledger = ledgerFor(scope);
  const i = ledger.indexOf(entry);
  if (i !== -1) ledger.splice(i, 1);
}

function reconcileSpend(scope, actual, entry) {
  if (!Number.isFinite(actual) || actual <= 0) return;
  if (!entry) return;
  entry.tokens = actual;
  delete entry.planned;
}

async function paceTokens(tokens, scope, label) {
  if (tokens >= TPM_LIMIT) {
    const msg =
      `request is ~${tokens.toLocaleString()} tokens, above the ` +
      `${TPM_LIMIT.toLocaleString()}/min budget — the provider will likely reject it. ` +
      `Lower BATCH_CHAR_BUDGET or raise LLM_TPM_LIMIT.`;
    spinner.notice(`${label}: ${msg}`);
    return null;
  }

  let announced = false;
  for (;;) {
    const now = Date.now();
    const used = spentInWindow(scope, now);
    if (used + tokens <= TPM_LIMIT) {
      const entry = reserve(scope, tokens, now);
      if (announced) spinner.update(label);
      return entry;
    }

    const ledger = ledgerFor(scope);
    const oldest = ledger[0];
    const waitMs = Math.max(500, oldest.ts + TPM_WINDOW_MS - now + 250);

    if (!announced) {
      announced = true;
      // Announced once. ui.status routes to whichever line is live (a phase bar,
      // a spinner) or emits a durable line, so there is no need to probe
      // isActive() first the way there was when notice() picked a stream.
      spinner.notice(
        `${label}: ${used.toLocaleString()}/${TPM_LIMIT.toLocaleString()} tokens used this ` +
        `minute — waiting for the window to reset`
      );
    }

    const deadline = now + Math.min(waitMs, TPM_WINDOW_MS);
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      // Only meaningful while something owns the live line; with no sink there
      // is no line to update and the announcement above already stands.
      if (ui.activeSink()) {
        spinner.update(
          `${label} · rate limit ${used.toLocaleString()}/${TPM_LIMIT.toLocaleString()} tokens · ` +
          `retrying in ${Math.ceil(remaining / 1000)}s`
        );
      }
      await sleep(Math.min(1000, remaining));
    }
  }
}

const DEFAULT_MAX_COMPLETION_TOKENS = (() => {
  const raw = parseInt(process.env.LLM_MAX_COMPLETION_TOKENS, 10);
  if (!Number.isFinite(raw) || raw < 256) return 16000;
  return Math.min(raw, 32768);
})();

function truncateBody(text) {
  const s = String(text || '');
  return s.length > ERROR_BODY_CHARS ? s.slice(0, ERROR_BODY_CHARS) + '…' : s;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(statusCode) {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function httpPostOnce(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const err = new Error(`HTTP ${res.statusCode}: ${truncateBody(data)}`);
          err.statusCode = res.statusCode;
          err.retryAfter = parseInt(res.headers['retry-after'], 10);
          return finish(reject, err);
        }
        try {
          finish(resolve, JSON.parse(data));
        } catch (e) {
          finish(reject, new Error(
            `Failed to parse response JSON: ${e.message}\nRaw: ${truncateBody(data)}`
          ));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      const err = new Error(`Request timed out after ${timeoutMs}ms`);
      err.retryable = true;
      finish(reject, err);
    });

    req.on('error', (err) => {

      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        err.retryable = false;
        err.hint = 'Check the hostname, your network, or any proxy settings.';
        return finish(reject, err);
      }
      err.retryable = true;
      finish(reject, err);
    });

    req.write(payload);
    req.end();
  });
}

async function httpPost(url, headers, body, label, scope = 'default') {
  let lastError;
  let attempts = 0;
  const requestTokens = estimateTokens(body);
  const reservation = await paceTokens(requestTokens, scope, label);

  // One funnel for every provider request, so one hook here traces generate(),
  // chat(), stream(), embed(), embedBatch() and probe() alike. Inert unless
  // `analyze --trace` turned it on.
  const span = trace.span(label, {
    model: body && body.model,
    provider: scope,
    stream: Boolean(body && body.stream),
    requestChars: (body && JSON.stringify(body) || '').length,
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const result = await httpPostOnce(url, headers, body, REQUEST_TIMEOUT_MS);

      const billed = result && result.usage && result.usage.total_tokens;
      if (Number.isFinite(billed)) reconcileSpend(scope, billed, reservation);
      span.finish(result, attempts);
      return result;
    } catch (err) {
      lastError = err;
      const retryable = err.retryable || isRetryable(err.statusCode);
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const backoff = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), RETRY_MAX_MS);
      const wait = Number.isFinite(err.retryAfter) && err.retryAfter > 0
        ? err.retryAfter * 1000
        : backoff + Math.floor(Math.random() * 250);

      const shortMsg = err.message.split('\n')[0];
      const waitSecs = Math.round(wait / 1000);
      spinner.notice(
        `${label}: attempt ${attempt}/${MAX_ATTEMPTS} failed (${shortMsg}) — retrying in ${waitSecs}s`
      );
      await sleep(wait);
    }
  }

  releaseReservation(scope, reservation);
  span.fail(lastError, attempts);

  const attemptsUsed = attempts === 1 ? '1 attempt' : `${attempts} attempts`;
  const rateLimited = lastError.statusCode === 413 || lastError.statusCode === 429;
  const hint = rateLimited
    ? `\n  Hint: the ~${requestTokens.toLocaleString()}-token request exceeded the ` +
      `${TPM_LIMIT.toLocaleString()}-token/min budget. Lower BATCH_CHAR_BUDGET ` +
      `(e.g. ${Math.floor(TPM_LIMIT / 3) * CHARS_PER_TOKEN}), or raise LLM_TPM_LIMIT ` +
      `if your Groq tier allows more.`
    : lastError.hint
      ? `\n  Hint: ${lastError.hint}`
      : '';

  throw new Error(`${label} failed after ${attemptsUsed}: ${lastError.message}${hint}`);
}

function getGroqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set — run `byakugan doctor` to check your .env');
  return key;
}

function getHFKey() {
  const key = process.env.HF_API_KEY;
  if (!key) throw new Error('HF_API_KEY is not set — run `byakugan doctor` to check your .env');
  return key;
}

function genModel() {
  return process.env.LLM_MODEL || DEFAULT_GEN_MODEL;
}

function embedModel() {
  return process.env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
}

function extractChoice(result, label) {
  const choice = result && result.choices && result.choices[0];
  const text = choice && choice.message && choice.message.content;

  if (!text) {

    const reasoning = (choice && choice.message && choice.message.reasoning) || '';
    const detail = reasoning
      ? ' The model spent the whole budget reasoning before answering.'
      : '';
    const err = new Error(
      `${label}: empty response (finish_reason=${(choice && choice.finish_reason) || 'unknown'}).` +
      detail +
      ' Raise LLM_MAX_COMPLETION_TOKENS, or set LLM_REASONING_EFFORT=low.'
    );
    err.retryable = false;
    throw err;
  }

  const finishReason = choice.finish_reason;

  if (finishReason === 'length') {
    const err = new Error(
      `${label}: response hit the output token ceiling (finish_reason=length) and was truncated. ` +
      `Reduce the batch size or raise LLM_MAX_COMPLETION_TOKENS.`
    );
    err.truncated = true;
    throw err;
  }

  return {
    text: String(text).trim(),
    finish_reason: finishReason || 'stop',
    usage: result.usage || null,
  };
}

async function generate(promptText, options = {}) {
  const {
    maxCompletionTokens = DEFAULT_MAX_COMPLETION_TOKENS,
    temperature = 0,
    json = true,
    reasoningEffort = process.env.LLM_REASONING_EFFORT || 'low',
  } = options;

  const body = {
    model:                 genModel(),
    messages:              [{ role: 'user', content: promptText }],
    temperature,
    max_completion_tokens: maxCompletionTokens,
  };

  if (reasoningEffort && reasoningEffort !== 'none') {
    body.reasoning_effort = reasoningEffort;
  }

  if (json) body.response_format = { type: 'json_object' };

  const result = await httpPost(
    GROQ_BASE_URL,
    { Authorization: `Bearer ${getGroqKey()}` },
    body,
    'Groq generate',
    'groq'
  );
  return extractChoice(result, 'Groq generate');
}

async function chat(messages, options = {}) {
  const { maxCompletionTokens = 2048, temperature = 0.3 } = options;

  const result = await httpPost(
    GROQ_BASE_URL,
    { Authorization: `Bearer ${getGroqKey()}` },
    {
      model:                 genModel(),
      messages,
      temperature,
      max_completion_tokens: maxCompletionTokens,
    },
    'Groq chat',
    'groq'
  );
  return extractChoice(result, 'Groq chat');
}

async function stream(messages, options = {}, onChunk) {
  const { maxCompletionTokens = 2048, temperature = 0.3 } = options;
  const tokens = estimateTokens(messages);
  const reservation = await paceTokens(tokens, 'groq', 'Groq stream');

  const body = {
    model:                 genModel(),
    messages,
    temperature,
    max_completion_tokens: maxCompletionTokens,
    stream:                true,
  };

  const payload = JSON.stringify(body);
  const parsed  = new URL(GROQ_BASE_URL);

  // stream() hand-rolls its SSE request, so it never passes through httpPost()
  // and needs its own span to show up in the trace.
  const span = trace.span('Groq stream', {
    model: body.model,
    provider: 'groq',
    stream: true,
    requestChars: payload.length,
  });

  return new Promise((resolve, reject) => {
    const options_ = {
      hostname: parsed.hostname,
      port:     443,
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization':  `Bearer ${getGroqKey()}`,
      },
    };

    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const req = require('https').request(options_, (res) => {
      if (res.statusCode >= 400) {
        let body_ = '';
        res.on('data', c => { body_ += c; });
        res.on('end', () => {
          releaseReservation('groq', reservation);
          const err = new Error(`HTTP ${res.statusCode}: ${truncateBody(body_)}`);
          span.fail(err, 1);
          finish(reject, err);
        });
        return;
      }

      let buffer = '';
      let fullText = '';
      let usage = null;

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const parts = buffer.split('\n');
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed_ = JSON.parse(data);
            if (parsed_.usage) usage = parsed_.usage;
            const delta = parsed_.choices &&
              parsed_.choices[0] &&
              parsed_.choices[0].delta &&
              parsed_.choices[0].delta.content;
            if (delta) {
              fullText += delta;
              if (typeof onChunk === 'function') onChunk(delta);
            }
          } catch { }
        }
      });

      res.on('end', () => {
        if (usage && Number.isFinite(usage.total_tokens)) {
          reconcileSpend('groq', usage.total_tokens, reservation);
        } else {
          releaseReservation('groq', reservation);
        }
        if (!fullText) {
          const err = new Error('Groq stream: no content received');
          span.fail(err, 1);
          finish(reject, err);
        } else {
          span.finish({ usage }, 1);
          finish(resolve, { text: fullText, usage });
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      releaseReservation('groq', reservation);
      const err = new Error(`Groq stream: timed out after ${REQUEST_TIMEOUT_MS}ms`);
      span.fail(err, 1);
      finish(reject, err);
    });

    req.on('error', (err) => {
      releaseReservation('groq', reservation);
      span.fail(err, 1);
      finish(reject, err);
    });

    req.write(payload);
    req.end();
  });
}

function normalizeEmbedResponse(result) {
  if (!Array.isArray(result)) {
    throw new Error('HF embed: unexpected response shape');
  }

  if (result.length > 0 && Array.isArray(result[0])) {
    return result[0];
  }
  if (result.length === 0) {
    throw new Error('HF embed: empty response');
  }
  return result;
}

async function embed(text) {
  const url = `${HF_BASE_URL}/${encodeURIComponent(embedModel())}`;

  const result = await httpPost(
    url,
    { Authorization: `Bearer ${getHFKey()}` },
    { inputs: text, normalize: true, truncate: true },
    'HF embed',
    'hf'
  );

  return normalizeEmbedResponse(result);
}

async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const url = `${HF_BASE_URL}/${encodeURIComponent(embedModel())}`;

  const result = await httpPost(
    url,
    { Authorization: `Bearer ${getHFKey()}` },
    { inputs: texts, normalize: true, truncate: true },
    'HF embedBatch',
    'hf'
  );

  if (!Array.isArray(result)) {
    throw new Error('HF embedBatch: unexpected response shape');
  }

  const vectors = result.map(normalizeEmbedResponse);
  if (vectors.length !== texts.length) {
    throw new Error(
      `HF embedBatch: sent ${texts.length} inputs, received ${vectors.length} vectors`
    );
  }
  return vectors;
}

async function probe() {
  const out = { generation: null, embedding: null };

  if (!process.env.GROQ_API_KEY) {
    out.generation = { ok: false, error: 'GROQ_API_KEY not set' };
  } else {
    try {
      const res = await generate('Reply with the single word JSON.', {

        maxCompletionTokens: 512,
        json: false,
      });
      out.generation = { ok: true, model: genModel(), reply: res.text.slice(0, 40) };
    } catch (err) {
      out.generation = { ok: false, model: genModel(), error: err.message };
    }
  }

  if (!process.env.HF_API_KEY) {
    out.embedding = { ok: false, error: 'HF_API_KEY not set' };
  } else {
    try {
      const vector = await embed('connectivity check');
      out.embedding = { ok: true, model: embedModel(), dimensions: vector.length };
    } catch (err) {
      out.embedding = { ok: false, model: embedModel(), error: err.message };
    }
  }

  return out;
}

async function routeQuery(question) {
  if (!fs.existsSync(ROUTE_PROMPT_FILE)) {
    throw new Error(`Route prompt not found: ${ROUTE_PROMPT_FILE}`);
  }

  const template = fs.readFileSync(ROUTE_PROMPT_FILE, 'utf8');
  const prompt = template.split('{{QUESTION}}').join(question);

  const { text } = await generate(prompt, { maxCompletionTokens: 16, json: false });

  const upper = text.toUpperCase();
  if (upper.includes('SEARCH')) return 'SEARCH';
  if (upper.includes('CHAT'))   return 'CHAT';

  return 'SEARCH';
}

module.exports = {
  generate,
  chat,
  stream,
  embed,
  embedBatch,
  routeQuery,
  probe,
  config: {
    genModel,
    embedModel,
    groqBaseUrl: GROQ_BASE_URL,
    hfBaseUrl: HF_BASE_URL,
  },
};