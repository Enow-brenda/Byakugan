'use strict';

// Hugging Face: embeddings for the RAG index.
//
// The only place that reads HF_API_KEY.

const config = require('../config');
const { httpPost } = require('../http-client');

class ProviderError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ProviderError';
    this.statusCode = statusCode;
  }
}

function getKey() {
  const key = process.env.HF_API_KEY;
  if (!key) throw new ProviderError('HF_API_KEY is not set on the server', 503);
  return key;
}

function url() {
  return `${config.hfBaseUrl}/${encodeURIComponent(config.embedModel)}`;
}

// The router is inconsistent about the response shape: a single input comes back
// as a flat array of numbers, a batched input as an array of arrays. Both shapes
// have to be normalised before the client's cosine maths sees them, and getting
// this wrong silently produces a zero-length index rather than an error.
function normalize(result) {
  if (!Array.isArray(result)) {
    throw new ProviderError('HF embed: unexpected response shape', 502);
  }
  if (result.length > 0 && Array.isArray(result[0])) return result[0];
  if (result.length === 0) {
    throw new ProviderError('HF embed: empty response', 502);
  }
  return result;
}

async function embed(inputs) {
  const result = await httpPost(
    url(),
    { Authorization: `Bearer ${getKey()}` },
    { inputs, normalize: true, truncate: true },
    'HF embed',
    'hf'
  );

  if (!Array.isArray(result)) {
    throw new ProviderError('HF embed: unexpected response shape', 502);
  }

  return result.map(normalize);
}

async function embedOne(text) {
  const vectors = await embed([text]);
  return vectors[0];
}

async function probe() {
  if (!process.env.HF_API_KEY) {
    return { ok: false, model: config.embedModel, error: 'HF_API_KEY not set on the server' };
  }
  try {
    const vector = await embedOne('connectivity check');
    return { ok: true, model: config.embedModel, dimensions: vector.length };
  } catch (err) {
    return { ok: false, model: config.embedModel, error: err.message };
  }
}

module.exports = { embed, embedOne, probe, ProviderError, getKey, normalize };
