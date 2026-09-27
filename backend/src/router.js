'use strict';

// HTTP surface.
//
//   GET  /v1/health            provider status, models, protocol version
//   GET  /v1/tasks             the task list, for `byakugan doctor --verbose`
//   POST /v1/generate          { task, variables, options } -> completion
//   POST /v1/stream            same body, Server-Sent Events
//   POST /v1/embed             { inputs: [...] } -> { vectors: [[...]] }
//
// Error mapping is the interesting part. The client already knows how to retry a
// 429 with Retry-After and how to report a 413, so provider failures are
// forwarded with those status codes intact. Everything else is flattened to a
// short, safe message: a raw provider error body can contain internal hostnames
// or account detail, and the client only ever needs to know it failed.

const http = require('http');
const config = require('./config');
const log = require('./logger');
const tasks = require('./tasks');
const billing = require('./billing');
const groq = require('./providers/groq');
const hf = require('./providers/hf');
const mock = require('./providers/mock');

function send(res, statusCode, payload, headers) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function sendError(res, statusCode, message, extra) {
  send(res, statusCode, { error: message, protocol: config.protocol, ...(extra || {}) });
}

// Buffers the body with a hard cap. Without the cap a single client can pin
// memory until the process dies, which on a small host means the outage hits
// every other user too.
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > config.maxBodyBytes) {
        const err = new Error(
          `Request body exceeds ${config.maxBodyBytes.toLocaleString()} bytes`
        );
        err.statusCode = 413;
        req.destroy();
        return reject(err);
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const err = new Error('Request body is not valid JSON');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

// Compares in constant time so a wrong token cannot be discovered a character at
// a time by timing the response.
function tokenMatches(expected, provided) {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

function authorize(req) {
  if (!config.token) return true;

  const header = req.headers['x-byakugan-token'];
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const provided = header || (bearer && bearer[1]);

  return tokenMatches(config.token, provided);
}

// The SSE stream. Frames are written as they arrive and never buffered, because
// the whole point is that the CLI reveals text progressively.
function streamResponse(res, onDelta) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  res.on('close', () => { closed = true; });

  return {
    send(data) {
      if (closed) return;
      res.write('data: ' + JSON.stringify(data) + '\n\n');
    },
    get closed() { return closed; },
    end: () => { if (!closed) res.end(); },
  };
}

function providerFor(name) {
  return config.mock ? mock : name === 'groq' ? groq : hf;
}

async function handleGenerate(req, res, body) {
  const request = tasks.buildRequest(body.task, body);
  const provider = providerFor('groq');

  const result = await provider.complete(request);
  return send(res, 200, { ...result, task: request.task, protocol: config.protocol });
}

async function handleStream(req, res, body) {
  const request = tasks.buildRequest(body.task, body);
  const provider = providerFor('groq');
  const stream = streamResponse(res);

  try {
    const result = await provider.completeStream(request, delta => {
      stream.send({ delta });
    });
    stream.send({ done: true, usage: result.usage });
  } catch (err) {
    // Mid-stream the status code is already sent, so the failure has to travel as
    // an event. The client reads it and reports it the same way it would report a
    // buffered error.
    log.reportProviderError('groq', `Groq ${request.task}`, err);
    stream.send({ error: describeError(err) });
  } finally {
    stream.end();
  }
}

async function handleEmbed(req, res, body) {
  const inputs = body.inputs;

  if (!Array.isArray(inputs) || !inputs.length) {
    return sendError(res, 400, '`inputs` must be a non-empty array of strings');
  }
  if (inputs.length > config.maxEmbedInputs) {
    return sendError(
      res, 413,
      `Too many inputs: ${inputs.length} exceeds the limit of ${config.maxEmbedInputs}`
    );
  }
  if (inputs.some(i => typeof i !== 'string')) {
    return sendError(res, 400, '`inputs` must contain only strings');
  }

  const provider = providerFor('hf');
  const vectors = await provider.embed(inputs);

  return send(res, 200, { vectors, dimensions: vectors[0] ? vectors[0].length : 0 });
}

async function handleHealth(res, deep) {
  const provider = config.mock ? mock : groq;
  const embedder = config.mock ? mock : hf;

  // A shallow health check stays free: it reports configuration without spending a
  // token. The client uses it on every startup, so it has to be cheap.
  if (!deep) {
    return send(res, 200, {
      ok: true,
      protocol: config.protocol,
      mock: config.mock,
      authRequired: Boolean(config.token),
      models: { gen: config.genModel, embed: config.embedModel },
      rate: billing.snapshot('groq'),
    });
  }

  const [generation, embedding] = await Promise.all([
    provider.probe(config.genModel),
    embedder.probe(config.embedModel),
  ]);
  return send(res, 200, {
    ok: generation.ok !== false && embedding.ok !== false,
    protocol: config.protocol,
    mock: config.mock,
    authRequired: Boolean(config.token),
    models: { gen: config.genModel, embed: config.embedModel },
    generation,
    embedding,
    rate: billing.snapshot('groq'),
  });
}

// Groq/HF organisation and project ids. Every pattern requires a real id shape -
// a known prefix plus a separator - because a looser "prefix followed by 10
// characters" rule silently mangled ordinary words: `projectSummary` matched
// `proj` + `ectSummary` and came out as `[redacted]`, turning a useful
// "missing variables" message into nonsense. The replacement also avoids reusing
// the `org_` prefix so a redacted id cannot be mistaken for a real one.
const PROVIDER_SECRETS = [
  { re: /\borg_[A-Za-z0-9]{8,}\b/g, as: '[redacted:org-id]' },
  { re: /\b(?:org|proj|project|billing|acct|account|user|team)[_-][A-Za-z0-9]{8,}\b/gi, as: '[redacted]' },
  { re: /\bsk-[A-Za-z0-9_-]{8,}\b/g, as: '[redacted:key]' },
  { re: /\b(?:gsk|hf|r8|pk)[_-][A-Za-z0-9]{12,}\b/g, as: '[redacted:key]' },
  { re: /\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, as: '[redacted]' },
];

function sanitizeProviderText(text) {
  let out = String(text);
  for (const { re, as } of PROVIDER_SECRETS) out = out.replace(re, as);
  return out;
}

// Pulls the human-readable `message` out of a provider body, or falls back to the
// bare first line.
function readableMessage(text) {
  const quoted = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (quoted) {
    try {
      return JSON.parse('"' + quoted[1] + '"');
    } catch {
      return quoted[1];
    }
  }
  return text;
}

// Reduces one `HTTP nnn: {json}` fragment to its message. The fragment is not
// anchored to the start of the string: the client-facing message is prefixed
// with "analyze_files failed after 1 attempt:" and followed by our own hint, so
// an anchored match silently missed every real provider error and passed the raw
// body through. That is how an org id reached a terminal.
function reduceProviderFragment(line) {
  const m = /HTTP (\d{3}):\s*(\{.*\})\s*$/.exec(line);
  if (!m) return line;
  return line.slice(0, m.index) + `HTTP ${m[1]}: ` + readableMessage(m[2]);
}

function describeError(err) {
  if (!err) return 'Unknown error';

  const raw = sanitizeProviderText(err.message || 'Unknown error');

  // Provider JSON is collapsed; our own text (the label, the attempt count, the
  // hint) is kept, because the hint is where the fix is and dropping it was the
  // other half of the original bug.
  const text = raw
    .split('\n')
    .map(line => reduceProviderFragment(line.trim()))
    .filter(Boolean)
    .join('\n');

  const flat = text.length > 400 ? text.slice(0, 400) + '…' : text;
  return flat;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;

    // The CLI makes no cross-origin requests, so CORS is not a control here and
    // is deliberately not enabled. Anything permissive would only matter if a
    // browser were calling this, which is not the threat model.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      if (!authorize(req)) {
        log.warn('rejected unauthorized request', { route });
        return sendError(res, 401, 'Invalid or missing Byakugan API token');
      }

      if (req.method === 'GET' && url.pathname === '/v1/health') {
        return await handleHealth(res, url.searchParams.get('deep') === '1');
      }

      if (req.method === 'GET' && url.pathname === '/v1/tasks') {
        return send(res, 200, { protocol: config.protocol, tasks: tasks.describe() });
      }

      if (req.method !== 'POST') {
        return sendError(res, 405, `Method not allowed: ${req.method}`);
      }

      const body = await readJson(req);

      switch (url.pathname) {
        case '/v1/generate': return await handleGenerate(req, res, body);
        case '/v1/stream':   return await handleStream(req, res, body);
        case '/v1/embed':    return await handleEmbed(req, res, body);
        default:
          return sendError(res, 404, `No such endpoint: ${url.pathname}`);
      }
    } catch (err) {
      const status = err.statusCode || 502;
      if (status >= 500) {
        log.reportProviderError('server', route, err);
      } else {
        log.debug('rejected request', { route, status, message: err.message });
      }
      if (!res.headersSent) {
        sendError(res, status, describeError(err), err.details);
      } else if (!res.writableEnded) {
        res.end();
      }
    } finally {
      log.debug('request', { route, ms: Date.now() - started });
    }
  });
}

module.exports = { createServer, describeError, tokenMatches, readJson };
