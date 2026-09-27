'use strict';

// The single outbound HTTP path from this backend to a provider.
//
// This is a port of the transport half of the CLI's old lib/llm.js, with the
// terminal UI calls swapped for the logger. Keeping the retry, timeout and
// backoff behaviour identical means moving a request from a user's laptop to
// here does not change how it fails, which is worth more than the refactor
// being tidier.

const https = require('https');
const http = require('http');
const config = require('./config');
const log = require('./logger');

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 20000;
const ERROR_BODY_CHARS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateBody(text) {
  const s = String(text || '');
  return s.length > ERROR_BODY_CHARS ? s.slice(0, ERROR_BODY_CHARS) + '…' : s;
}

function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil((text || '').length / config.charsPerToken);
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
      // A DNS failure cannot be fixed by trying again, so it must not consume
      // the retry budget or it turns a bad hostname into a 4-attempt stall.
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

// Retries transient failures with exponential backoff plus jitter, honouring
// Retry-After when the provider sends one. Returns the parsed response.
async function httpPost(url, headers, body, label, scope) {
  const billing = require('./billing');
  const requestTokens = estimateTokens(body);
  const reservation = await billing.reserve(scope, requestTokens, label);

  let lastError;
  let attempts = 0;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    attempts = attempt;
    try {
      const result = await httpPostOnce(url, headers, body, config.timeoutMs);

      const billed = result && result.usage && result.usage.total_tokens;
      if (Number.isFinite(billed)) billing.reconcile(scope, billed, reservation);
      else billing.release(reservation);

      return result;
    } catch (err) {
      lastError = err;

      const retryable = err.retryable || isRetryable(err.statusCode);
      if (!retryable || attempt === config.maxAttempts) break;

      const backoff = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), RETRY_MAX_MS);
      const wait = Number.isFinite(err.retryAfter) && err.retryAfter > 0
        ? err.retryAfter * 1000
        : backoff + Math.floor(Math.random() * 250);

      log.warn(`${label}: attempt ${attempt}/${config.maxAttempts} failed, retrying`, {
        message: err.message,
        waitMs: Math.round(wait),
        scope,
      });
      await sleep(wait);
    }
  }

  billing.release(reservation);
  log.reportProviderError(scope, label, lastError);

  const attemptsUsed = attempts === 1 ? '1 attempt' : `${attempts} attempts`;
  const rateLimited = lastError.statusCode === 413 || lastError.statusCode === 429;
  const hint = rateLimited
    ? `\n  Hint: the ~${requestTokens.toLocaleString()}-token request exceeded the ` +
      `${config.tpmLimit.toLocaleString()}-token/min budget.`
    : lastError.hint
      ? `\n  Hint: ${lastError.hint}`
      : '';

  throw new Error(`${label} failed after ${attemptsUsed}: ${lastError.message}${hint}`);
}

// Opens a streaming request. `onDelta` receives text fragments as they arrive;
// resolves with the full text when the provider closes the stream.
//
// The pacing reservation is awaited before the socket opens, so a burst of
// streaming clients queues exactly like buffered ones do. Doing that inside the
// promise executor would need a latch, and the await is simpler to reason about.
async function httpStream(url, headers, body, label, scope, onDelta) {
  const billing = require('./billing');

  const reservation = await billing.reserve(scope, estimateTokens(body), label);

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    let settled = false;
    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      fn(val);
    };
    const release = () => billing.release(reservation);

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Accept:           'text/event-stream',
        ...headers,
      },
    }, (res) => {
      if (res.statusCode >= 400) {
        let body_ = '';
        res.setEncoding('utf8');
        res.on('data', c => { body_ += c; });
        res.on('end', () => {
          const err = new Error(`HTTP ${res.statusCode}: ${truncateBody(body_)}`);
          err.statusCode = res.statusCode;
          log.reportProviderError(scope, label, err);
          release();
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
              if (typeof onDelta === 'function') onDelta(delta);
            }
          } catch { /* a partial frame: the next chunk completes it */ }
        }
      });

      res.on('end', () => {
        if (usage && Number.isFinite(usage.total_tokens)) {
          billing.reconcile(scope, usage.total_tokens, reservation);
        } else {
          release();
        }
        if (!fullText) {
          finish(reject, new Error(`${label}: no content received`));
        } else {
          finish(resolve, { text: fullText, usage });
        }
      });
    });

    req.setTimeout(config.timeoutMs, () => {
      req.destroy();
      release();
      finish(reject, new Error(`${label}: timed out after ${config.timeoutMs}ms`));
    });

    req.on('error', err => {
      release();
      finish(reject, err);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { httpPost, httpStream, estimateTokens, isRetryable, sleep, truncateBody };
