'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const llm = require('./llm');
const spinner = require('./spinner');

const PROMPT_FILE = path.join(__dirname, '..', 'templates', 'prompts', 'explain.md');

const LEVEL_NAMES = { 1: 'Junior', 2: 'Mid', 3: 'Senior', 4: 'Lead', 5: 'GodMode' };

function readJSONFile(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} not found at ${file}. Run \`byakugan analyze <path>\` first.`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${label}: ${err.message}`);
  }
}

function fill(template, values) {
  return Object.entries(values).reduce(
    (acc, [key, val]) => acc.split(`{{${key}}}`).join(val == null ? '' : String(val)),
    template
  );
}

function findFile(analysis, filePath) {
  const normalized = filePath.split(path.sep).join('/');
  const entry = analysis.files.find(f =>
    f.path === normalized ||
    f.path.endsWith('/' + normalized) ||
    normalized.endsWith('/' + f.path) ||
    f.path === filePath
  );
  if (!entry) {
    const available = analysis.files.map(f => f.path).slice(0, 10).join('\n  ');
    throw new Error(
      `File "${filePath}" not found in analysis.json.\n` +
      `Available files (first 10):\n  ${available}`
    );
  }
  return entry;
}

function buildRelatedChunks(analysis, filePath, embeddings) {
  if (!embeddings) return '(no embeddings index — run `byakugan analyze` to rebuild)';

  const normalized = filePath.split(path.sep).join('/');

  const related = embeddings
    .filter(c =>
      c.id !== `file:${normalized}` &&
      (c.id === 'overview' ||
       c.id.startsWith('technique:') ||
       c.id.startsWith('hotspot:') ||
       c.id.startsWith('dep:'))
    )
    .slice(0, 6)
    .map(c => c.text);

  return related.join('\n\n---\n\n') || '(none)';
}

async function explain(filePath, options = {}) {
  const dir = options.projectPath ? path.resolve(options.projectPath) : process.cwd();
  const byakuganDir = path.join(dir, '.byakugan');

  const analysis = readJSONFile(path.join(byakuganDir, 'analysis.json'), 'analysis.json');

  let profile = { name: null, intent: 'onboarding', level: 3 };
  const profileFile = path.join(byakuganDir, 'profile.json');
  if (fs.existsSync(profileFile)) {
    try {
      profile = { ...profile, ...JSON.parse(fs.readFileSync(profileFile, 'utf8')) };
    } catch { }
  }

  let embeddings = null;
  const embeddingsFile = path.join(byakuganDir, 'embeddings.json');
  if (fs.existsSync(embeddingsFile)) {
    try {
      embeddings = JSON.parse(fs.readFileSync(embeddingsFile, 'utf8'));
    } catch { }
  }

  const fileEntry = findFile(analysis, filePath);

  const exports = (fileEntry.exports || []).length
    ? fileEntry.exports.map(e => `  ${e.kind} ${e.name}${e.signature ? ': ' + e.signature : ''}`).join('\n')
    : '  (none exported)';

  const imports = (fileEntry.imports || []).length
    ? fileEntry.imports.map(i => `  from "${i.source}"${(i.names || []).length ? ': ' + i.names.join(', ') : ''}`).join('\n')
    : '  (no imports)';

  const relatedChunks = buildRelatedChunks(analysis, fileEntry.path, embeddings);

  if (!fs.existsSync(PROMPT_FILE)) {
    throw new Error(`Explain prompt not found: ${PROMPT_FILE}`);
  }
  const template = fs.readFileSync(PROMPT_FILE, 'utf8');

  const prompt = fill(template, {
    PROJECT_NAME:   analysis.project.name,
    LEVEL_NAME:     LEVEL_NAMES[profile.level] || 'Senior',
    LEVEL:          profile.level,
    INTENT:         profile.intent || 'onboarding',
    FILE_PATH:      fileEntry.path,
    LANGUAGE:       fileEntry.language,
    LINES:          fileEntry.lines,
    COMPLEXITY:     fileEntry.complexity,
    PURPOSE:        fileEntry.purpose || '(not recorded)',
    EXPORTS:        exports,
    IMPORTS:        imports,
    RELATED_CHUNKS: relatedChunks,
  });

  console.log(chalk.cyan(`\n› Explaining ${chalk.bold.green(fileEntry.path)}...\n`));

  const { text } = await spinner.during('Thinking', () => llm.chat([
    { role: 'user', content: prompt },
  ]));

  console.log(chalk.bold.green('Explanation:\n'));
  console.log(text + '\n');
}

module.exports = { explain };
