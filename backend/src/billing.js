'use strict';

// Shared rate limiting and spend accounting.
//
// The CLI already paced its own calls against a rolling one-minute window, but
// that ledger lived in the user's process: every install believed it owned the
// full Groq allowance, so N concurrent users over-ran the tier N-fold. Here the
// ledger is per-process and shared by everyone the backend serves, which is one
// of the main reasons to run a backend at all.
//
// Waiters are served FIFO. A plain "everyone re-checks every second" loop lets a
// later, smaller request jump ahead of an earlier large one repeatedly, so a
// batch of analyze passes can starve a chat reply indefinitely.

const config = require('./config');
const log = require('./logger');

const WINDOW_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// scope -> { entries: [{scope, ts, tokens, tenantId}], queue: [] }
const windows = new Map();
// client token (or 'anonymous') -> { minute: [...], day: [...] }
const tenants = new Map();

function scopeState(scope) {
  if (!windows.has(scope)) windows.set(scope, { entries: [], queue: [] });
  return windows.get(scope);
}

function tenantState(id) {
  if (!tenants.has(id)) tenants.set(id, { day: [] });
  return tenants.get(id);
}

function prune(entries, now, span) {
  while (entries.length && now - entries[0].ts >= span) entries.shift();
  return entries;
}

function sum(entries) {
  return entries.reduce((total, entry) => total + entry.tokens, 0);
}

class BudgetError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'BudgetError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// A single request larger than the whole window can never be paced into place,
// so it is refused rather than queued forever. 413 is what the client already
// recognises as "too big", which is why it keeps that status code.
function checkRequestSize(tokens, label) {
  if (tokens >= config.tpmLimit) {
    throw new BudgetError(
      `${label}: the request is ~${tokens.toLocaleString()} tokens, which exceeds the ` +
      `${config.tpmLimit.toLocaleString()}-token/min budget on its own and can never be paced. ` +
      'Lower BATCH_CHAR_BUDGET or raise LLM_TPM_LIMIT on the server.',
      413,
      { requestTokens: tokens, tpmLimit: config.tpmLimit }
    );
  }
}

function checkTenant(tenant, tokens, label) {
  if (!tenant) return;

  const now = Date.now();

  if (config.maxTokensPerMinutePerToken) {
    prune(tenant.minute || (tenant.minute = []), now, WINDOW_MS);
    const used = sum(tenant.minute);
    if (used + tokens > config.maxTokensPerMinutePerToken) {
      throw new BudgetError(
        `${label}: this client's per-minute allowance of ` +
        `${config.maxTokensPerMinutePerToken.toLocaleString()} tokens is exhausted.`,
        429,
        { retryAfterSeconds: 60 }
      );
    }
  }

  if (config.maxTokensPerDay) {
    prune(tenant.day, now, DAY_MS);
    const used = sum(tenant.day);
    if (used + tokens > config.maxTokensPerDay) {
      throw new BudgetError(
        `${label}: this client's daily allowance of ` +
        `${config.maxTokensPerDay.toLocaleString()} tokens is exhausted.`,
        429,
        { retryAfterSeconds: Math.ceil((tenant.day[0].ts + DAY_MS - now) / 1000) }
      );
    }
  }
}

// Reserves capacity for `tokens`, waiting if the window is full. Resolves to a
// handle that is later either reconciled with the provider's real usage or
// released back to the window.
function reserve(scope, tokens, label, tenantId) {
  checkRequestSize(tokens, label);
  const id = tenantId || null;
  if (id) checkTenant(tenantState(id), tokens, label);

  const state = scopeState(scope);

  return new Promise((resolve, reject) => {
    state.queue.push({ tokens, label, tenantId: id, resolve, reject });
    drain(scope);
  });
}

function drain(scope) {
  const state = scopeState(scope);

  while (state.queue.length) {
    const now = Date.now();
    prune(state.entries, now, WINDOW_MS);

    const head = state.queue[0];
    const used = sum(state.entries);

    if (used + head.tokens <= config.tpmLimit) {
      state.queue.shift();
      const entry = { scope, ts: now, tokens: head.tokens, planned: true };
      state.entries.push(entry);

      if (head.tenantId) {
        const t = tenantState(head.tenantId);
        t.day.push({ ts: now, tokens: head.tokens });
        if (t.minute) t.minute.push({ ts: now, tokens: head.tokens });
      }

      head.resolve(entry);
      continue;
    }

    // Not enough room for the head of the queue. Wait for the window to slide,
    // then look again. A smaller request behind it is deliberately not allowed to
    // overtake, which keeps a long analysis from starving interactive calls.
    const oldest = state.entries[0] ? state.entries[0].ts : now;
    const waitMs = Math.max(250, oldest + WINDOW_MS - now + 100);
    setTimeout(() => drain(scope), Math.min(waitMs, WINDOW_MS));
    return;
  }
}

function release(entry) {
  if (!entry || !entry.scope) return;
  const entries = scopeState(entry.scope).entries;
  const i = entries.indexOf(entry);
  if (i !== -1) entries.splice(i, 1);
}

function reconcile(scope, actual, entry) {
  if (!entry) return;
  if (!Number.isFinite(actual) || actual <= 0) return release(entry);
  entry.tokens = actual;
  delete entry.planned;
}

function snapshot(scope) {
  const now = Date.now();
  const state = scopeState(scope);
  prune(state.entries, now, WINDOW_MS);
  return {
    scope,
    used: sum(state.entries),
    limit: config.tpmLimit,
    waiting: state.queue.length,
  };
}

function reset() {
  windows.clear();
  tenants.clear();
}

module.exports = { reserve, release, reconcile, snapshot, reset, BudgetError, WINDOW_MS };
