'use strict';

// The CLI's LLM gateway — and nothing else in this package makes a network call.
//
// The provider credentials live on the backend, never here. This module speaks
// the Byakugan task protocol: it names a task, sends the variables that task
// needs, and receives a finished answer. It does not know the prompt wording, the
// models, or the provider.
//
// That is not only about key hygiene. A published npm package is readable by
// anyone, so a token inside it is a speed bump rather than a control. The control
// is that the backend only accepts the fixed set of tasks in its own registry.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const spinner = require('./spinner');
const ui = require('./ui');
const trace = require('./trace');

const PROTOCOL = 1;

const DEFAULT_BASE_URL = process.env.BYAKUGAN_API_URL || 'https://byakugan-ehsv.onrender.com/';

const REQUEST_TIMEOUT_MS = Number(process.env.BYAKUGAN_TIMEOUT_MS) || 180000;
const MAX_ATTEMPTS = Number(process.env.BYAKUGAN_MAX_ATTEMPTS) || 4;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 20000;
const MAX_VARIABLE_BYTES = 256 * 1024;

// Filled in from /v1/health at startup so the CLI can name the models it is
// actually talking to without hardcoding them.
const health = {
  models: { gen: 'server', embed: 'server' },
  mock: false,
  authRequired: false,
  known: false,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baseUrl() {
  const raw = process.env.BYAKUGAN_API_URL || DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
}

function apiToken() {
  return process.env.BYAKUGAN_API_TOKEN || '';
}

function isRetryable(statusCode) {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function endpoint(pathname) {
  const url = new URL(baseUrl() + pathname);
  return {
    lib: url.protocol === 'https:' ? https : http,
    options: {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
    },
  };
}

function authHeaders(extra) {
  const headers = { ...extra };
  const token = apiToken();
  if (token) headers['x-byakugan-token'] = token;
  return headers;
}

class BackendError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'BackendError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// One request, no retry. Retries and the trace span live in postJson so there is
// exactly one place that decides how a failure is handled.
function postJson(pathname, body, onResponse) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const { lib, options } = endpoint(pathname);

    const req = lib.request({
      ...options,
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      }),
    }, onResponse(resolve, reject, req => req.destroy()));

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(Object.assign(
        new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`),
        { retryable: true }
      ));
    });

    req.on('error', (err) => {
      // Refused and unreachable are the two failure modes users will actually hit,
      // and both need to say so plainly rather than reporting a socket error.
      if (err.code === 'ECONNREFUSED') {
        return reject(Object.assign(
          new BackendError(
            `Cannot reach the Byakugan backend at ${baseUrl()}. ` +
            'Is it running? Set BYAKUGAN_API_URL if it is somewhere else.',
            0
          ),
          { retryable: false }
        ));
      }
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        return reject(Object.assign(
          new BackendError(
            `Cannot resolve the host in BYAKUGAN_API_URL (${baseUrl()}). ` +
            'Check the address and your network.',
            0
          ),
          { retryable: false }
        ));
      }
      reject(Object.assign(err, { retryable: true }));
    });

    req.write(payload);
    req.end();
  });
}

function collect(res, resolve, reject) {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => resolve({ statusCode: res.statusCode, data }));
  res.on('error', reject);
}

function parseOrThrow({ statusCode, data }) {
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw Object.assign(new Error(`Backend returned a non-JSON response (HTTP ${statusCode})`), {
      statusCode,
      retryable: false,
    });
  }

  if (statusCode >= 400) {
    // 429 and 413 are forwarded by the backend with the status intact, which is
    // what lets the retry loop below treat a budget rejection exactly like a
    // rate limit.
    throw Object.assign(
      new BackendError(parsed.error || `HTTP ${statusCode}`, statusCode, parsed),
      { retryAfter: parsed.retryAfterSeconds }
    );
  }
  return parsed;
}

// Retries transient failures with exponential backoff plus jitter, honouring the
// Retry-After the backend sends.
async function postJsonWithRetry(pathname, body, label, span) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = parseOrThrow(await postJson(
        pathname,
        body,
        (resolve, reject, destroy) => (res) => {
          if (span) span.annotate({ status: res.statusCode });
          collect(res, resolve, reject);
        }
      ));
      if (span) span.finish(result, attempt);
      return result;
    } catch (err) {
      lastError = err;
      const retryable = err.retryable || isRetryable(err.statusCode);
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const backoff = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), RETRY_MAX_MS);
      const wait = Number.isFinite(err.retryAfter) && err.retryAfter > 0
        ? err.retryAfter * 1000
        : backoff + Math.floor(Math.random() * 250);

      spinner.notice(
        `${label}: attempt ${attempt}/${MAX_ATTEMPTS} failed ` +
        `(${String(err.message).split('\n')[0]}) — retrying in ${Math.round(wait / 1000)}s`
      );
      await sleep(wait);
    }
  }

  if (span) span.fail(lastError, MAX_ATTEMPTS);

  const attempts = MAX_ATTEMPTS === 1 ? '1 attempt' : `${MAX_ATTEMPTS} attempts`;
  throw new BackendError(`${label} failed after ${attempts}: ${lastError.message}`);
}

// Guards against a caller assembling a request the backend will reject anyway, so
// the failure names the offending variable here instead of arriving as a 400.
function assertVariablesFit(variables) {
  const size = Buffer.byteLength(JSON.stringify(variables || {}));
  if (size > MAX_VARIABLE_BYTES) {
    throw new BackendError(
      `Request variables are ${(size / 1024).toFixed(0)} KB, over the ` +
      `${(MAX_VARIABLE_BYTES / 1024).toFixed(0)} KB limit. ` +
      'Try a smaller batch with --max-chars.',
      413
    );
  }
}

function openTaskSpan(label, task, body) {
  if (!trace.isEnabled()) return null;
  return trace.span(label, {
    provider: 'backend',
    model: health.models.gen,
    requestChars: Buffer.byteLength(JSON.stringify(body || {})),
  });
}

// --- public API ------------------------------------------------------------

// Runs a named task and returns { text, finish_reason, usage }.
async function task(name, variables, options) {
  const body = { task: name, variables: variables || {}, options: options || {} };
  assertVariablesFit(body.variables);

  const label = `Byakugan task:${name}`;
  const span = openTaskSpan(label, name, body);
  return postJsonWithRetry('/v1/generate', body, label, span);
}

// Streams a named task. The backend sends deltas as the model produces them and
// this module forwards each one straight through — no buffering, so the CLI's
// reveal pacing still feels like typing. Pacing for reading is deliberately a
// client concern: the server has no idea how fast anyone reads.
function streamTask(name, variables, history, options, onChunk) {
  const body = {
    task: name,
    variables: variables || {},
    history: history || [],
    options: { ...(options || {}), stream: true },
  };
  assertVariablesFit(body.variables);

  const label = `Byakugan task:${name}`;
  const span = openTaskSpan(label, name, body);
  const { lib, options: conn } = endpoint('/v1/stream');
  const payload = Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const req = lib.request({
      ...conn,
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Accept: 'text/event-stream',
      }),
    }, (res) => {
      if (res.statusCode >= 400) {
        // A rejection before the stream opens is a normal HTTP error and can be
        // retried like any other.
        return collect(res, (result) => {
          let err;
          try { parseOrThrow(result); } catch (e) { err = e; }
          if (span) span.fail(err, 1);
          finish(reject, err || new BackendError(`HTTP ${res.statusCode}`, res.statusCode));
        }, (err) => {
          if (span) span.fail(err, 1);
          finish(reject, err);
        });
      }

      let buffer = '';
      let fullText = '';
      let usage = null;
      let failure = null;

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const frames = buffer.split('\n\n');
        buffer = frames.pop();

        for (const frame of frames) {
          const line = frame.replace(/^data: /, '').trim();
          if (!line) continue;

          let parsed;
          try { parsed = JSON.parse(line); } catch { continue; }

          // The status line is already sent, so a mid-stream failure arrives as an
          // event rather than an HTTP code.
          if (parsed.error) {
            failure = new BackendError(parsed.error, 502);
            continue;
          }
          if (parsed.done) { usage = parsed.usage || usage; continue; }
          if (typeof parsed.delta === 'string') {
            fullText += parsed.delta;
            if (typeof onChunk === 'function') onChunk(parsed.delta);
          }
        }
      });

      res.on('end', () => {
        if (failure) {
          if (span) span.fail(failure, 1);
          return finish(reject, failure);
        }
        if (!fullText) {
          const err = new BackendError(`${label}: the backend closed the stream with no content`, 502);
          if (span) span.fail(err, 1);
          return finish(reject, err);
        }
        const result = { text: fullText, finish_reason: 'stop', usage };
        if (span) span.finish(result, 1);
        finish(resolve, result);
      });

      res.on('error', (err) => {
        if (span) span.fail(err, 1);
        finish(reject, err);
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      const err = new BackendError(`${label}: timed out after ${REQUEST_TIMEOUT_MS}ms`, 504);
      if (span) span.fail(err, 1);
      finish(reject, err);
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        err = new BackendError(
          `Cannot reach the Byakugan backend at ${baseUrl()}. Is it running?`,
          0
        );
      }
      if (span) span.fail(err, 1);
      finish(reject, err);
    });

    req.write(payload);
    req.end();
  });
}

async function embed(text) {
  const result = await tasklessEmbed([text]);
  return result[0];
}

async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  return tasklessEmbed(texts);
}

async function tasklessEmbed(inputs) {
  const label = 'Byakugan embed';
  const span = openTaskSpan(label, 'embed', { inputs });
  const result = await postJsonWithRetry('/v1/embed', { inputs }, label, span);
  if (!Array.isArray(result.vectors)) {
    throw new BackendError('Backend returned an embedding response with no vectors', 502);
  }
  if (result.vectors.length !== inputs.length) {
    throw new BackendError(
      `Backend returned ${result.vectors.length} vectors for ${inputs.length} inputs`,
      502
    );
  }
  return result.vectors;
}

// Replaces the old routeQuery: the route prompt lives on the backend now, so this
// is just a named task with one variable.
async function routeQuery(question) {
  const { text } = await task('route', { QUESTION: question });
  const upper = String(text).toUpperCase();
  if (upper.includes('CHAT')) return 'CHAT';
  return 'SEARCH';
}

// The startup check and `doctor` both go through here. The shallow form costs
// nothing, so it is safe to call before every command that will need the backend.
async function probe(options) {
  const deep = Boolean(options && options.deep);
  const label = 'Byakugan health';
  const span = openTaskSpan(label, 'health', null);

  let response;
  try {
    response = await new Promise((resolve, reject) => {
      const { lib, options: conn } = endpoint('/v1/health' + (deep ? '?deep=1' : ''));
      const req = lib.request(
        { ...conn, method: 'GET', headers: authHeaders({ Accept: 'application/json' }) },
        (res) => collect(res, resolve, reject)
      );
      req.setTimeout(deep ? REQUEST_TIMEOUT_MS : 10000, () => {
        req.destroy();
        reject(Object.assign(new Error('Health check timed out'), { retryable: true }));
      });
      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          return reject(new BackendError(
            `Cannot reach the Byakugan backend at ${baseUrl()}. ` +
            'Start it, or set BYAKUGAN_API_URL.', 0
          ));
        }
        if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
          return reject(new BackendError(
            `Cannot resolve the host in BYAKUGAN_API_URL (${baseUrl()}).`, 0
          ));
        }
        reject(err);
      });
      req.end();
    });
  } catch (err) {
    if (span) span.fail(err, 1);
    return {
      ok: false,
      reachable: false,
      error: String(err.message).split('\n')[0],
    };
  }

  let parsed;
  try {
    parsed = parseOrThrow(response);
  } catch (err) {
    if (span) span.fail(err, 1);
    return {
      ok: false,
      reachable: response.statusCode < 500,
      error: response.statusCode === 401 || response.statusCode === 403
        ? 'The backend rejected this API token. Check BYAKUGAN_API_TOKEN.'
        : String(err.message).split('\n')[0],
    };
  }

  health.models = parsed.models || health.models;
  health.mock = Boolean(parsed.mock);
  health.authRequired = Boolean(parsed.authRequired);
  health.known = true;

  if (span) span.finish(parsed, 1);

  if (deep) {
    return {
      ok: parsed.ok !== false,
      reachable: true,
      protocol: parsed.protocol,
      mock: parsed.mock,
      models: parsed.models,
      generation: parsed.generation,
      embedding: parsed.embedding,
      rate: parsed.rate,
    };
  }

  return {
    ok: parsed.ok !== false,
    reachable: true,
    protocol: parsed.protocol,
    mock: parsed.mock,
    models: parsed.models,
    rate: parsed.rate,
  };
}

// Fails fast, before a multi-minute scan, if the backend is unreachable or the
// token is wrong. Called once at startup by the commands that need it.
async function ensureConnected() {
  if (health.known) return health;

  const result = await probe();
  if (!result.reachable) {
    throw new BackendError(result.error || 'The Byakugan backend is unreachable', 0);
  }
  if (!result.ok) {
    throw new BackendError('The Byakugan backend reported a problem: ' + (result.error || 'unknown'), 502);
  }
  if (result.protocol !== PROTOCOL) {
    throw new BackendError(
      `Protocol mismatch: this CLI speaks v${PROTOCOL}, the backend is v${result.protocol}. ` +
      'Update whichever one is older.',
      409
    );
  }
  if (health.authRequired && !apiToken()) {
    throw new BackendError(
      'This backend requires an API token. Set BYAKUGAN_API_TOKEN.',
      401
    );
  }
  return health;
}

module.exports = {
  task,
  streamTask,
  embed,
  embedBatch,
  routeQuery,
  probe,
  ensureConnected,
  baseUrl,
  health,
  BackendError,
  PROTOCOL,
};
