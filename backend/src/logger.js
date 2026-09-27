'use strict';

// Minimal levelled logger. The backend deliberately has no logging dependency:
// it must be deployable with `npm install --omit=dev` and nothing else.
//
// Two rules this file exists to enforce:
//   1. Never log a value that came from a key or a token.
//   2. Never log prompt text. A prompt is the user's source code.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Anything whose name looks like a credential is redacted even if a caller
// passes it by accident, so a future edit cannot turn a stray log into a leak.
const SECRET_KEY = /(key|token|secret|password|authorization|cookie|credential)/i;

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 3) return '[deep]';

  const type = typeof value;
  if (type === 'string') return value.length > 500 ? value.slice(0, 500) + '…' : value;
  if (type === 'number' || type === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));
  if (type !== 'object') return String(value);

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

function emit(level, message, fields) {
  if (LEVELS[level] > LEVELS[currentLevel]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (fields && Object.keys(fields).length) line.data = redact(fields);
  process.stdout.write(JSON.stringify(line) + '\n');
}

let currentLevel = 'info';

function setLevel(level) {
  if (Object.prototype.hasOwnProperty.call(LEVELS, level)) currentLevel = level;
}

// A failed provider call is the interesting event, so the error is logged as its
// own line rather than being folded into the request that caused it.
function reportProviderError(provider, label, err) {
  emit('error', `${label} failed`, {
    provider,
    message: err && err.message,
    statusCode: err && err.statusCode,
    retryable: err && err.retryable,
  });
}

setLevel(require('./config').logLevel);

module.exports = {
  error: (msg, fields) => emit('error', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  debug: (msg, fields) => emit('debug', msg, fields),
  setLevel,
  reportProviderError,
  redact,
};
