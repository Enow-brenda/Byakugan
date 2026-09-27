'use strict';

const MAX_FILES         = Number(process.env.MAX_FILES) || 800;
const MAX_CONTENT_CHARS = Number(process.env.MAX_CONTENT_CHARS) || 1500000;

// BATCH_CHAR_BUDGET is a cap on the SERIALIZED payload of one batch, not on the
// raw source it was built from. The old version counted `content.length + path +
// 40` per file, which ignored every JSON key, every `\n` that serialization
// expands to two characters, and the fixed prompt that gets prepended on the
// server. Undercounting that badly is what pushed real requests past the
// provider's per-minute limit.
//
// The default is derived from the backend's free-tier budget rather than picked:
//
//   8,000 token/min  -  4,096 reserved for output  =  3,904 input tokens
//   3,904            -  1,114 fixed prompt         =  2,790 for the payload
//   2,790            x  3 chars/token (backend)    =  ~8,370 chars
//
// 8,000 sits just under that ceiling so a little prompt growth or an extra field
// per file cannot push a batch over. It is a wall-clock-independent ceiling: it
// assumes the backend's defaults, so a backend with a raised LLM_TPM_LIMIT can
// safely be given a larger BATCH_CHAR_BUDGET, and a lower one wants a smaller
// value. Changing the default without redoing the arithmetic above is how this
// regresses.
const BATCH_CHAR_BUDGET = Number(process.env.BATCH_CHAR_BUDGET) || 8000;

const PACK_TOLERANCE = 1.05;

// Tokens of prompt that every analyze_files call carries before the payload.
// Measured from backend/src/prompts/analyze_files.md; only used to keep the
// estimate the CLI prints honest, never to decide a hard limit.
const PROMPT_OVERHEAD_TOKENS = 1114;

const TRUNCATION_MARKER =
  '\n\n[... truncated: this file alone exceeded the per-request budget ...]';

const MIN_FILE_CONTENT_CHARS = 500;

// A file inside an array is indented two spaces deeper than the same object
// serialized on its own, and a record has eight fields, so the array form costs
// roughly this much more per entry.
const ARRAY_INDENT_COST = 20;

// Deliberately more conservative than the backend's own charsPerToken of 3, so
// an under-estimate here never becomes an over-promise on the wire.
const CHARS_PER_TOKEN = 3;

function tokensForChars(chars) {
  return Math.ceil((Number(chars) || 0) / CHARS_PER_TOKEN);
}

function estimateTokens(text) {
  return tokensForChars((text || '').length);
}

// What this file costs once it is serialized into BATCH_DATA, rather than what
// its source weighed on disk.
function fileSerializedChars(file) {
  return JSON.stringify(file, null, 2).length + ARRAY_INDENT_COST;
}

function batchPayloadChars(batch) {
  if (!batch.length) return 0;
  return 2 + batch.reduce((sum, f) => sum + fileSerializedChars(f), 0) + (batch.length - 1);
}

function fileCost(file) {
  return fileSerializedChars(file);
}

// Shaves a file down until its serialized form fits one request. Without this a
// single pathological file - a minified bundle or a generated data file, where
// 100 "lines" can be hundreds of kilobytes - would get a batch to itself and
// blow the provider limit for the whole run. The scanner already caps files at
// 100 lines, so in practice this only engages for unusually long lines, and the
// result is marked as truncated so the analysis says so rather than pretending
// the file was smaller than it is.
function clampFileToBudget(file, limit) {
  const overhead = fileSerializedChars({ ...file, content: '' }) + TRUNCATION_MARKER.length;
  const room = limit - overhead;

  if (room >= file.content.length) return { file, clamped: false };

  if (room < MIN_FILE_CONTENT_CHARS) {
    return { drop: true, reason: `single file cannot fit one request (${limit} char batch budget)` };
  }

  // Serialization expands what it escapes - every newline costs two characters -
  // so the arithmetic above is only a starting guess. Shrink until the measured
  // result genuinely fits, measuring the marker too because it is part of the
  // content that ends up serialized.
  let cut = room;
  while (cut > 0) {
    const candidate = file.content.slice(0, cut) + TRUNCATION_MARKER;
    if (fileSerializedChars({ ...file, content: candidate }) <= limit) break;
    cut = Math.floor(cut * 0.92);
  }

  if (cut <= 0) {
    return { drop: true, reason: `single file cannot fit one request (${limit} char batch budget)` };
  }

  return {
    file: {
      ...file,
      content: file.content.slice(0, cut) + TRUNCATION_MARKER,
      truncated: true,
      mode: 'budget',
    },
    clamped: true,
  };
}

function selectFiles(files, options = {}) {
  const maxFiles = options.maxFiles || MAX_FILES;
  const maxChars = options.maxChars || MAX_CONTENT_CHARS;
  const budget = options.budget || BATCH_CHAR_BUDGET;

  const selected = [];
  const dropped = [];
  const clamped = [];
  let usedChars = 0;

  for (const file of files) {
    if (selected.length >= maxFiles) {
      dropped.push({ path: file.path, reason: `file cap (${maxFiles})` });
      continue;
    }

    const fit = clampFileToBudget(file, budget);

    if (fit.drop) {
      dropped.push({ path: file.path, reason: fit.reason });
      continue;
    }
    if (fit.clamped) clamped.push(fit.file.path);

    const cost = fileCost(fit.file);

    if (usedChars + cost > maxChars) {
      dropped.push({ path: file.path, reason: `content cap (${maxChars} chars)` });
      continue;
    }

    selected.push(fit.file);
    usedChars += cost;
  }

  return {
    selected,
    dropped,
    clamped,
    usedChars,
    maxFiles,
    maxChars,
  };
}

function packBatches(files, options = {}) {
  const limit = Math.floor((options.budget || BATCH_CHAR_BUDGET) * PACK_TOLERANCE);

  const batches = [];
  let current = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length > 0) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
  };

  for (const file of files) {
    const cost = fileCost(file);

    // No standalone special case any more. selectFiles has already guaranteed
    // every file's serialized size fits a request on its own, so a file that
    // nearly fills the budget simply ends up alone in a batch here, which is the
    // behaviour the old 0.9-of-budget threshold was trying to force.
    if (current.length > 0 && currentChars + cost > limit) {
      flush();
    }

    current.push(file);
    currentChars += cost;
  }

  flush();

  return batches;
}

function describePlan(selection, batches) {
  const batchCalls = batches.map(b => PROMPT_OVERHEAD_TOKENS + tokensForChars(batchPayloadChars(b)));

  return {
    filesSelected: selection.selected.length,
    filesDropped: selection.dropped.length,
    filesClamped: (selection.clamped || []).length,
    // The ceilings that actually applied, which differ from the module
    // constants whenever --max-files / --max-chars override them.
    maxFiles: selection.maxFiles,
    maxChars: selection.maxChars,
    charsUsed: selection.usedChars,
    batchCount: batches.length,
    largestBatchChars: batches.reduce((max, b) => Math.max(max, batchPayloadChars(b)), 0),
    // Now includes the fixed prompt, so this is comparable against a real
    // tokens-per-minute limit instead of silently omitting the largest constant
    // in the request. Covers the per-batch passes only; the survey and
    // synthesize calls are small and not counted here.
    estimatedInputTokens: batchCalls.reduce((sum, t) => sum + t, 0),
    largestBatchTokens: batchCalls.reduce((max, t) => Math.max(max, t), 0),
  };
}

module.exports = {
  MAX_FILES,
  MAX_CONTENT_CHARS,
  BATCH_CHAR_BUDGET,
  PROMPT_OVERHEAD_TOKENS,
  tokensForChars,
  estimateTokens,
  fileCost,
  fileSerializedChars,
  batchPayloadChars,
  clampFileToBudget,
  selectFiles,
  packBatches,
  describePlan,
};
