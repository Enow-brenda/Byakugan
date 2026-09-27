'use strict';

// Groq: text generation, chat and streaming.
//
// This is the only place in the whole repository that reads GROQ_API_KEY. The
// key is fetched at call time rather than held in config, so a missing or
// revoked key produces a clean provider error on one request instead of stopping
// the process from booting — `doctor` needs the server up in order to report it.

const config = require('../config');
const { httpPost, httpStream } = require('../http-client');
const billing = require('../billing');

class ProviderError extends Error {
  constructor(message, statusCode, retryAfter) {
    super(message);
    this.name = 'ProviderError';
    this.statusCode = statusCode;
    if (retryAfter) this.retryAfter = retryAfter;
  }
}

function getKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new ProviderError('GROQ_API_KEY is not set on the server', 503);
  return key;
}

function buildBody({ prompt, messages, options }) {
  const body = {
    model:                 config.genModel,
    messages:              messages || [{ role: 'user', content: prompt }],
    temperature:           options.temperature === undefined ? 0 : options.temperature,
    max_completion_tokens: options.maxCompletionTokens || config.maxCompletionTokens,
  };

  const effort = options.reasoningEffort || config.reasoningEffort;
  if (effort && effort !== 'none') body.reasoning_effort = effort;
  if (options.json) body.response_format = { type: 'json_object' };

  return body;
}

// Turns a raw completion into { text, finish_reason, usage }.
//
// The empty-response and truncated-response cases are not paranoia: gpt-oss
// models reason before answering and will happily spend the entire output
// budget on reasoning, which surfaces as an empty message with
// finish_reason=length. Both need their own hint, because the fix is different
// in each case.
function extractChoice(result, label) {
  const choice = result && result.choices && result.choices[0];
  const text = choice && choice.message && choice.message.content;

  if (!text) {
    const reasoning = (choice && choice.message && choice.message.reasoning) || '';
    const detail = reasoning
      ? ' The model spent the whole budget reasoning before answering.'
      : '';
    throw new ProviderError(
      `${label}: empty response (finish_reason=${(choice && choice.finish_reason) || 'unknown'}).` +
      detail +
      ' Raise LLM_MAX_COMPLETION_TOKENS, or set LLM_REASONING_EFFORT=low.',
      502
    );
  }

  if (choice.finish_reason === 'length') {
    const err = new ProviderError(
      `${label}: response hit the output token ceiling (finish_reason=length) and was ` +
      'truncated. Reduce the batch size or raise LLM_MAX_COMPLETION_TOKENS.',
      502
    );
    err.truncated = true;
    throw err;
  }

  return {
    text: String(text).trim(),
    finish_reason: choice.finish_reason || 'stop',
    usage: result.usage || null,
  };
}

async function complete(request) {
  const body = buildBody(request);
  const result = await httpPost(
    config.groqBaseUrl,
    { Authorization: `Bearer ${getKey()}` },
    body,
    `Groq ${request.task}`,
    'groq'
  );
  return extractChoice(result, `Groq ${request.task}`);
}

// Streams straight through to the caller. The server does not pace the text for
// reading: the CLI reveals it at its own comfortable rate, so buffering here
// would add latency without improving anything.
async function completeStream(request, onDelta) {
  const body = buildBody(request);
  body.stream = true;

  const result = await httpStream(
    config.groqBaseUrl,
    { Authorization: `Bearer ${getKey()}` },
    body,
    `Groq ${request.task}`,
    'groq',
    onDelta
  );

  return { text: result.text, finish_reason: 'stop', usage: result.usage };
}

async function probe() {
  if (!process.env.GROQ_API_KEY) {
    return { ok: false, model: config.genModel, error: 'GROQ_API_KEY not set on the server' };
  }
  try {
    const res = await complete({
      task: 'probe',
      prompt: 'Reply with the single word JSON.',
      options: { maxCompletionTokens: 512, json: false, reasoningEffort: 'low' },
    });
    return { ok: true, model: config.genModel, reply: res.text.slice(0, 40) };
  } catch (err) {
    return { ok: false, model: config.genModel, error: err.message };
  }
}

module.exports = { complete, completeStream, probe, ProviderError, getKey, billing };
