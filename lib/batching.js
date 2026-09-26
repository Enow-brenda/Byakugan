'use strict';

const MAX_FILES         = Number(process.env.MAX_FILES) || 800;
const MAX_CONTENT_CHARS = Number(process.env.MAX_CONTENT_CHARS) || 1500000;
const BATCH_CHAR_BUDGET = Number(process.env.BATCH_CHAR_BUDGET) || 16000;
const STANDALONE_FILE_CHARS = Math.floor(BATCH_CHAR_BUDGET * 0.9);
const PACK_TOLERANCE = 1.05;

function estimateTokens(text) {
  return Math.ceil((text || '').length / 3.5);
}

function fileCost(file) {

  return file.content.length + file.path.length + 40;
}

function selectFiles(files, options = {}) {
  const maxFiles = options.maxFiles || MAX_FILES;
  const maxChars = options.maxChars || MAX_CONTENT_CHARS;

  const selected = [];
  const dropped = [];
  let usedChars = 0;

  for (const file of files) {
    const cost = fileCost(file);

    if (selected.length >= maxFiles) {
      dropped.push({ path: file.path, reason: `file cap (${maxFiles})` });
      continue;
    }
    if (usedChars + cost > maxChars) {
      dropped.push({ path: file.path, reason: `content cap (${maxChars} chars)` });
      continue;
    }

    selected.push(file);
    usedChars += cost;
  }

  return {
    selected,
    dropped,
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

    if (cost > STANDALONE_FILE_CHARS) {

      flush();
      batches.push([file]);
      continue;
    }

    if (currentChars + cost > limit) {
      flush();
    }

    current.push(file);
    currentChars += cost;
  }

  flush();

  return batches;
}

function describePlan(selection, batches) {
  return {
    filesSelected: selection.selected.length,
    filesDropped: selection.dropped.length,
    charsUsed: selection.usedChars,
    batchCount: batches.length,
    largestBatchChars: batches.reduce(
      (max, b) => Math.max(max, b.reduce((s, f) => s + fileCost(f), 0)), 0
    ),
    estimatedInputTokens: batches.reduce(
      (sum, b) => sum + estimateTokens(JSON.stringify(b)), 0
    ),
  };
}

module.exports = {
  MAX_FILES,
  MAX_CONTENT_CHARS,
  BATCH_CHAR_BUDGET,
  STANDALONE_FILE_CHARS,
  estimateTokens,
  fileCost,
  selectFiles,
  packBatches,
  describePlan,
};