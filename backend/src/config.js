'use strict';

// Server configuration. Everything here is read from the environment so the same
// build can run locally, on Render, or on a laptop with a .env file.
//
// The API keys never appear in this object. They are read inside the provider
// modules, at call time, so that a misconfigured key surfaces as a provider
// error on a single request rather than as a boot-time crash for the whole
// process. `doctor` depends on that: it reports per-provider status.

// The .env is read from this directory, not from the current working directory.
// That distinction matters: the default cwd when a service starts is its own
// root, but a developer running `node backend/src/index.js` from a project
// directory would otherwise load that project's .env and pick up whatever
// unrelated keys happened to be in it. Real environment variables still win —
// dotenv never overwrites a variable that is already set, which is exactly the
// behaviour a deployment platform relies on.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

// Bumped when the request/response shape changes incompatibly. The client checks
// it during the startup health probe so an out-of-date CLI fails with a version
// message instead of an inscrutable parse error months from now.
const PROTOCOL = 1;

const config = {
  protocol: PROTOCOL,
  env: str('NODE_ENV', 'development'),
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),

  // Shared secret. Optional: with no token the endpoint is open, which is only
  // sensible for local development. See README for why the task restriction,
  // not this token, is the real control on spend.
  token: str('BYAKUGAN_API_TOKEN', ''),

  // Groq
  groqBaseUrl: str('GROQ_BASE_URL', 'https://api.groq.com/openai/v1/chat/completions'),
  genModel: str('LLM_MODEL', 'openai/gpt-oss-120b'),
  reasoningEffort: str('LLM_REASONING_EFFORT', 'low'),

  // Hugging Face
  hfBaseUrl: str('HF_BASE_URL', 'https://router.huggingface.co/hf-inference/models'),
  embedModel: str('EMBED_MODEL', 'BAAI/bge-small-en-v1.5'),

  // Transport resilience, carried over from the CLI so behaviour does not shift
  // when a request moves from the user's machine to here.
  timeoutMs: num('LLM_TIMEOUT_MS', 120000),
  maxAttempts: num('LLM_MAX_ATTEMPTS', 4),
  maxCompletionTokens: num('LLM_MAX_COMPLETION_TOKENS', 16000),

  // Rate limiting. This is now a single shared ledger for every user of the
  // backend, which is the whole reason the split is worth doing: previously each
  // CLI process believed it owned the full Groq allowance.
  tpmLimit: num('LLM_TPM_LIMIT', 8000),
  charsPerToken: 3,

  // Per-tenant guards, so one runaway client cannot drain the account.
  maxTokensPerDay: num('BYAKUGAN_MAX_TOKENS_PER_DAY', 0) || null,
  maxTokensPerMinutePerToken: num('BYAKUGAN_TOKEN_TPM_LIMIT', 0) || null,

  // Request guards.
  maxBodyBytes: num('BYAKUGAN_MAX_BODY_BYTES', 1048576),
  maxEmbedInputs: num('BYAKUGAN_MAX_EMBED_INPUTS', 256),
  maxVariablesBytes: num('BYAKUGAN_MAX_VARIABLE_BYTES', 262144),

  // Mock mode answers from fixtures instead of the providers. It is what makes
  // the client and server verifiable end to end without live keys. Refused in
  // production unless explicitly forced, because a mock build in production
  // would look healthy and return invented analysis.
  mock: bool('BYAKUGAN_MOCK', false),
  allowMockInProduction: bool('BYAKUGAN_ALLOW_MOCK', false),

  logLevel: str('BYAKUGAN_LOG_LEVEL', 'info'),
};

if (config.mock && config.env === 'production' && !config.allowMockInProduction) {
  throw new Error(
    'BYAKUGAN_MOCK is on in production. Set BYAKUGAN_ALLOW_MOCK=true to confirm, ' +
    'or turn mock mode off.'
  );
}

module.exports = config;
