'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── config ──────────────────────────────────────────────────────────────────

const GROQ_BASE_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const HF_BASE_URL    = 'https://api-inference.huggingface.co/pipeline/feature-extraction';

const DEFAULT_GEN_MODEL   = 'llama-3.3-70b-versatile';
const DEFAULT_EMBED_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

const ROUTE_PROMPT_FILE = path.join(__dirname, '..', 'templates', 'prompts', 'route.md');

// ─── tiny http helper (no axios dep needed) ──────────────────────────────────

function httpPost(url, headers, body) {
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

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response JSON: ${e.message}\nRaw: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── key helpers ─────────────────────────────────────────────────────────────

function getGroqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set in environment');
  return key;
}

function getHFKey() {
  const key = process.env.HF_API_KEY;
  if (!key) throw new Error('HF_API_KEY is not set in environment');
  return key;
}

// ─── generate ─────────────────────────────────────────────────────────────────
// One-shot text generation — used by analyzer.js for producing analysis JSON.

async function generate(promptText) {
  const modelId = process.env.LLM_MODEL || DEFAULT_GEN_MODEL;

  const result = await httpPost(
    GROQ_BASE_URL,
    { Authorization: `Bearer ${getGroqKey()}` },
    {
      model:       modelId,
      messages:    [{ role: 'user', content: promptText }],
      temperature: 0,
      max_tokens:  8192,
    }
  );

  const text = result.choices && result.choices[0] && result.choices[0].message &&
               result.choices[0].message.content;
  if (!text) throw new Error('Groq generate: empty response');
  return text.trim();
}

// ─── chat ─────────────────────────────────────────────────────────────────────
// Multi-turn chat — used by chat.js with a full messages array.

async function chat(messages) {
  const modelId = process.env.LLM_MODEL || DEFAULT_GEN_MODEL;

  const result = await httpPost(
    GROQ_BASE_URL,
    { Authorization: `Bearer ${getGroqKey()}` },
    {
      model:       modelId,
      messages,
      temperature: 0.3,
      max_tokens:  1024,
    }
  );

  const text = result.choices && result.choices[0] && result.choices[0].message &&
               result.choices[0].message.content;
  if (!text) throw new Error('Groq chat: empty response');
  return text.trim();
}

// ─── embed ────────────────────────────────────────────────────────────────────
// Embed a string via Hugging Face Inference API.
// Returns a number[] (the embedding vector).

async function embed(text) {
  const modelId = process.env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
  const url = `${HF_BASE_URL}/${encodeURIComponent(modelId)}`;

  const result = await httpPost(
    url,
    { Authorization: `Bearer ${getHFKey()}` },
    { inputs: text }
  );

  // HF returns either number[] directly or number[][] — flatten if nested
  if (Array.isArray(result) && Array.isArray(result[0])) {
    // pooled result returned as [[...]] — take first
    return result[0];
  }
  if (Array.isArray(result)) {
    return result;
  }
  throw new Error('HF embed: unexpected response shape');
}

// ─── routeQuery ───────────────────────────────────────────────────────────────
// Classify a user question as needing retrieval ('SEARCH') or not ('CHAT').
// Reads the routing prompt from templates/prompts/route.md.

async function routeQuery(question) {
  if (!fs.existsSync(ROUTE_PROMPT_FILE)) {
    throw new Error(`Route prompt not found: ${ROUTE_PROMPT_FILE}`);
  }

  const template = fs.readFileSync(ROUTE_PROMPT_FILE, 'utf8');
  const prompt = template.split('{{QUESTION}}').join(question);

  const raw = await generate(prompt);

  // Be tolerant — accept any response that contains SEARCH or CHAT
  const upper = raw.toUpperCase();
  if (upper.includes('SEARCH')) return 'SEARCH';
  if (upper.includes('CHAT'))   return 'CHAT';

  // Default to SEARCH so we never miss a retrieval that was needed
  return 'SEARCH';
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = { generate, chat, embed, routeQuery };
