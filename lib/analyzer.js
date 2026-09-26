'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const llm = require('./llm');
const scanner = require('./scanner');

const PROMPT_TEMPLATE = path.join(__dirname, '..', 'templates', 'prompts', 'analyze.md');
const OUTPUT_DIR      = path.join(process.cwd(), '.byakugan');
const OUTPUT_FILE     = path.join(OUTPUT_DIR, 'analysis.json');
const EMBEDDINGS_FILE = path.join(OUTPUT_DIR, 'embeddings.json');

const REQUIRED_KEYS = [
  'schema_version', 'project', 'overview', 'chakra_network',
  'techniques', 'impact_sight', 'files', 'quiz',
];

// ─── validation ───────────────────────────────────────────────────────────────

function validatePath(targetPath) {
  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    throw new Error(`Path does not exist or is not readable: ${targetPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${targetPath}`);
  }
}

// ─── prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(scanResult) {
  if (!fs.existsSync(PROMPT_TEMPLATE)) {
    throw new Error(`Prompt template not found: ${PROMPT_TEMPLATE}`);
  }
  const template = fs.readFileSync(PROMPT_TEMPLATE, 'utf8');
  const scannedData = JSON.stringify(scanResult.files, null, 2);
  return template
    .split('{{SOURCE_PATH}}').join(scanResult.sourcePath)
    .split('{{SCANNED_DATA}}').join(scannedData);
}

// ─── parse + validate ─────────────────────────────────────────────────────────

function parseAndValidate(raw) {
  // Strip markdown code fences if the model wrapped the output
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`LLM output is not valid JSON: ${err.message}`);
  }
  const missing = REQUIRED_KEYS.filter(k => !(k in data));
  if (missing.length > 0) {
    throw new Error(`analysis.json is missing required keys: ${missing.join(', ')}`);
  }
  return data;
}

// ─── save analysis ────────────────────────────────────────────────────────────

function saveAnalysis(data) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── build chunks for embedding ───────────────────────────────────────────────

function buildChunks(analysis) {
  const chunks = [];
  const p = analysis.project;
  const o = analysis.overview;

  // overview chunk
  chunks.push({
    id:   'overview',
    text: [
      `Project: ${p.name}`,
      `Description: ${p.description}`,
      `Language: ${p.primary_language}`,
      p.framework         ? `Framework: ${p.framework}`               : null,
      p.package_manager   ? `Package manager: ${p.package_manager}`   : null,
      `Architecture: ${o.architecture_pattern || 'unknown'}`,
      `Summary: ${o.summary}`,
      `Total files: ${o.total_files}, Total lines: ${o.total_lines}`,
      `Has tests: ${o.has_tests}`,
      o.entry_points && o.entry_points.length
        ? `Entry points: ${o.entry_points.join(', ')}`
        : null,
    ].filter(Boolean).join('\n'),
  });

  // one chunk per file
  for (const f of (analysis.files || [])) {
    const exportNames = (f.exports || []).map(e => e.name).join(', ');
    chunks.push({
      id: `file:${f.path}`,
      text: [
        `File: ${f.path}`,
        `Language: ${f.language}`,
        `Lines: ${f.lines}`,
        `Complexity: ${f.complexity}`,
        `Purpose: ${f.purpose}`,
        exportNames ? `Exports: ${exportNames}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  // one chunk per technique
  for (const t of (analysis.techniques || [])) {
    chunks.push({
      id: `technique:${t.name}`,
      text: [
        `Technique: ${t.name}`,
        `Category: ${t.category}`,
        `What it is: ${t.what_it_is}`,
        `Why it matters: ${t.why_it_matters}`,
        t.significance ? `Significance: ${t.significance}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  // one chunk per hotspot
  for (const h of ((analysis.impact_sight && analysis.impact_sight.hotspots) || [])) {
    chunks.push({
      id: `hotspot:${h.file}`,
      text: `Hotspot file: ${h.file}\nReason: ${h.reason}\nRisk: ${h.risk}`,
    });
  }

  // one chunk per external dependency
  for (const d of ((analysis.impact_sight && analysis.impact_sight.external_dependencies) || [])) {
    chunks.push({
      id: `dep:${d.name}`,
      text: [
        `Dependency: ${d.name}`,
        `Type: ${d.is_dev_only ? 'dev only' : 'runtime'}`,
        d.used_in && d.used_in.length ? `Used in: ${d.used_in.join(', ')}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  return chunks;
}

// ─── embed all chunks and save ────────────────────────────────────────────────

async function buildAndSaveEmbeddings(analysis) {
  const chunks = buildChunks(analysis);
  const result = [];

  for (const chunk of chunks) {
    const vector = await llm.embed(chunk.text);
    result.push({ id: chunk.id, text: chunk.text, vector });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(result, null, 2), 'utf8');
  return result.length;
}

// ─── main entry point ─────────────────────────────────────────────────────────

async function analyze(targetPath) {
  const resolved = path.resolve(targetPath);

  console.log(chalk.cyan('› Validating path...'));
  validatePath(resolved);

  console.log(chalk.cyan('› Scanning project files...'));
  const scanResult = scanner.scan(resolved);
  console.log(chalk.cyan(`  Found ${scanResult.totalFiles} files (${scanResult.totalLines} lines)`));

  console.log(chalk.cyan('› Building prompt...'));
  const promptText = buildPrompt(scanResult);

  console.log(chalk.cyan('› Calling LLM (this may take a moment)...'));
  const raw = await llm.generate(promptText);

  console.log(chalk.cyan('› Parsing and validating response...'));
  const data = parseAndValidate(raw);

  console.log(chalk.cyan('› Saving analysis...'));
  saveAnalysis(data);

  console.log(chalk.cyan('› Building embeddings for RAG chat...'));
  const chunkCount = await buildAndSaveEmbeddings(data);
  console.log(chalk.cyan(`  Embedded ${chunkCount} chunks → embeddings.json`));
}

module.exports = {
  analyze,
  validatePath,
  buildPrompt,
  parseAndValidate,
  saveAnalysis,
  buildChunks,
  buildAndSaveEmbeddings,
};
