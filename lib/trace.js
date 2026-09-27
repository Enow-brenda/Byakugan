'use strict';

// Opt-in provider call tracing, enabled with `analyze --trace`.
//
// This module records and renders; it never makes network calls. Recording
// happens in llm.js because httpPost() is the single funnel every Groq and
// Hugging Face request passes through, so one hook there covers generate(),
// chat(), stream(), embed(), embedBatch() and probe() without touching each of
// them.

const ui = require('./ui');

let enabled = false;
let entries = [];
let sequence = 0;

function enable() {
  enabled = true;
  entries = [];
  sequence = 0;
}

function disable() {
  enabled = false;
}

// Called from llm.js httpPost(). A started span returns a finish() the caller
// invokes with the response, so timing and billed tokens are measured around the
// real request rather than estimated after the fact.
function span(label, meta = {}) {
  if (!enabled) return { finish() {}, fail() {} };

  const startedAt = Date.now();
  const entry = {
    index: ++sequence,
    label,
    model: meta.model || null,
    provider: meta.provider || null,
    stream: Boolean(meta.stream),
    requestChars: meta.requestChars || 0,
    attempts: 0,
    status: 'pending',
    ms: 0,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    error: null,
  };
  entries.push(entry);

  let done = false;
  return {
    finish(result, attempts) {
      if (done) return;
      done = true;
      entry.ms = Date.now() - startedAt;
      if (Number.isFinite(attempts)) entry.attempts = attempts;
      const usage = result && result.usage;
      if (usage && Number.isFinite(usage.total_tokens)) {
        entry.totalTokens = usage.total_tokens;
      }
      if (usage && Number.isFinite(usage.prompt_tokens)) {
        entry.promptTokens = usage.prompt_tokens;
      }
      if (usage && Number.isFinite(usage.completion_tokens)) {
        entry.completionTokens = usage.completion_tokens;
      }
      entry.status = 'ok';
    },
    fail(error, attempts) {
      if (done) return;
      done = true;
      entry.ms = Date.now() - startedAt;
      if (Number.isFinite(attempts)) entry.attempts = attempts;
      entry.status = 'error';
      entry.error = ui.firstLine(error && error.message ? error.message : String(error));
    },
  };
}

function isEnabled() {
  return enabled;
}

function list() {
  return entries.slice();
}

function reset() {
  entries = [];
  sequence = 0;
}

function num(n) {
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function ms(n) {
  if (!Number.isFinite(n)) return '—';
  return n < 1000 ? n + 'ms' : (n / 1000).toFixed(1) + 's';
}

// Rolls the per-call rows up into the numbers a reader actually wants: how many
// calls, how many tokens, how long, and where the retries went.
function totals() {
  const done = entries.filter((e) => e.status !== 'pending');
  const tokens = done.reduce((s, e) => s + (e.totalTokens || 0), 0);
  const wall = done.reduce((s, e) => s + (e.ms || 0), 0);
  const retried = done.filter((e) => e.attempts > 1).length;
  const failed = done.filter((e) => e.status === 'error').length;
  return {
    calls: done.length,
    tokens,
    wall,
    retried,
    failed,
    promptTokens: done.reduce((s, e) => s + (e.promptTokens || 0), 0),
    completionTokens: done.reduce((s, e) => s + (e.completionTokens || 0), 0),
  };
}

// Renders the trace as UI output. Called by the analyze command after the run,
// so the table is a summary rather than something that fights the live phases.
function render() {
  const rows = entries;
  ui.blank();
  ui.group('trace');

  if (!rows.length) {
    ui.note('no provider calls were made');
    return;
  }

  const body = rows.map((e) => [
    String(e.index),
    e.label,
    e.model || '—',
    e.status === 'ok' ? 'ok' : e.status === 'error' ? 'failed' : 'pending',
    e.attempts > 1 ? e.attempts + 'x' : '1x',
    num(e.totalTokens),
    ms(e.ms),
  ]);

  ui.grid(
    ['#', 'call', 'model', 'status', 'tries', 'tokens', 'took'],
    body,
    { accentColumn: 6 }
  );

  const t = totals();
  ui.blank();
  ui.table([
    ['calls', num(t.calls)],
    ['tokens', num(t.tokens)],
    ['prompt', num(t.promptTokens)],
    ['completion', num(t.completionTokens)],
    ['request time', ms(t.wall)],
    ['retried', String(t.retried)],
    ['failed', String(t.failed)],
  ], { labelWidth: 12 });

  for (const e of rows) {
    if (e.status === 'error' && e.error) ui.note('#' + e.index + ' ' + e.error);
  }
}

module.exports = {
  enable,
  disable,
  isEnabled,
  span,
  list,
  reset,
  totals,
  render,
};
