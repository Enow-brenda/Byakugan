'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const chalk = require('chalk');

const PROMPT_TEMPLATE = path.join(__dirname, '..', 'templates', 'prompts', 'analyze.md');
const OUTPUT_DIR = path.join(process.cwd(), '.byakugan');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'analysis.json');
const TEMP_PROMPT = path.join(os.tmpdir(), 'byakugan-prompt.md');
const REQUIRED_KEYS = ['schema_version', 'project', 'overview', 'chakra_network',
                       'techniques', 'impact_sight', 'files', 'quiz'];

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

function buildPrompt(resolvedPath) {
  if (!fs.existsSync(PROMPT_TEMPLATE)) {
    throw new Error(`Prompt template not found: ${PROMPT_TEMPLATE}`);
  }
  const template = fs.readFileSync(PROMPT_TEMPLATE, 'utf8');
  const prompt = template.split('{{SOURCE_PATH}}').join(resolvedPath);
  fs.writeFileSync(TEMP_PROMPT, prompt, 'utf8');
  return TEMP_PROMPT;
}

function callBob(promptPath) {
  const result = spawnSync('bob', ['run', '--output', 'json', '--prompt', promptPath], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 300000,
  });
  if (result.error) {
    throw new Error(`Failed to launch bob: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim();
    throw new Error(`bob exited with code ${result.status}${detail ? ': ' + detail : ''}`);
  }
  const raw = (result.stdout || '').trim();
  if (!raw) {
    throw new Error('bob produced no output');
  }
  return raw;
}

function parseAndValidate(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Bob output is not valid JSON: ${err.message}`);
  }
  const missing = REQUIRED_KEYS.filter(k => !(k in data));
  if (missing.length > 0) {
    throw new Error(`analysis.json is missing required keys: ${missing.join(', ')}`);
  }
  return data;
}

function saveAnalysis(data) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function analyze(targetPath) {
  const resolved = path.resolve(targetPath);

  console.log(chalk.cyan('› Validating path...'));
  validatePath(resolved);

  console.log(chalk.cyan('› Building prompt...'));
  const promptPath = buildPrompt(resolved);

  try {
    console.log(chalk.cyan('› Calling Bob (this may take a moment)...'));
    const raw = callBob(promptPath);

    console.log(chalk.cyan('› Parsing and validating response...'));
    const data = parseAndValidate(raw);

    console.log(chalk.cyan('› Saving analysis...'));
    saveAnalysis(data);
  } finally {
    try { fs.unlinkSync(promptPath); } catch { /* best-effort cleanup */ }
  }
}

module.exports = { analyze, validatePath, buildPrompt, callBob, parseAndValidate, saveAnalysis };
