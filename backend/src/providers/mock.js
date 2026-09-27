'use strict';

// Mock provider mode.
//
// Answers every task with a structurally valid, deterministic response built
// from the request's own variables, so the CLI and this backend can be verified
// end to end with no Groq or Hugging Face key and no network.
//
// This exists for two reasons. One is verification: the interesting failures in a
// split like this are protocol mismatches, not model quality, and those are only
// findable by running the whole thing. The other is onboarding: someone can clone
// the repo and use the CLI before they have keys.
//
// It is a stand-in for a model, not a mock of this service: it receives the
// rendered prompt and the task variables, exactly as a provider would, and it has
// no access to keys, the rate limiter's real behaviour, or the filesystem.
//
// config.js refuses to start with this on in production unless
// BYAKUGAN_ALLOW_MOCK is set, because a mock build in production would look
// healthy and quietly return invented analysis.

const config = require('../config');
const log = require('../logger');

const EMBED_DIMS = 384;

// Cheap content-derived delay so streaming behaves like a real provider. Without
// it, a streamed answer lands as one lump and the CLI's reveal pacing is never
// exercised end to end.
const STREAM_DELAY_MS = 4;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// --- embeddings ------------------------------------------------------------

// A bag-of-words vector over hashed tokens. Real lexical similarity, so RAG
// retrieval returns something sensible rather than noise, and deterministic, so
// repeated runs of the same project produce the same index.
function embedOne(text) {
  const vector = new Array(EMBED_DIMS).fill(0);
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9_$]{2,}/g) || [];

  for (const token of tokens) {
    vector[hash(token) % EMBED_DIMS] += 1;
  }
  // Bigrams give a little ordering sensitivity without a real tokenizer.
  for (let i = 0; i < tokens.length - 1; i++) {
    vector[hash(tokens[i] + '_' + tokens[i + 1]) % EMBED_DIMS] += 0.5;
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) {
    vector[hash(String(text)) % EMBED_DIMS] = 1;
    return vector;
  }
  return vector.map(v => v / norm);
}

// --- analyze passes --------------------------------------------------------

// MANIFEST_DATA arrives as "### <path>\n<file contents>" blocks, so the
// project name is most reliably a package.json "name" field. Falls back to a
// "Name:" line and finally to a placeholder.
function nameFromManifest(manifest) {
  const text = String(manifest || '');
  const quoted = /"name"\s*:\s*"([^"]+)"/.exec(text);
  if (quoted) return quoted[1];
  const line = /^[#\s]*Name:\s*(\S+)/m.exec(text);
  if (line) return line[1];
  return 'unknown-project';
}

function survey(vars) {
  const totalFiles = Number(vars.TOTAL_FILES) || 0;
  const totalLines = Number(vars.TOTAL_LINES) || 0;

  const entryPoints = String(vars.FILE_INVENTORY || '')
    .split('\n')
    .map(line => line.split('|')[0].trim())
    .filter(line => /^(bin|src|index|main|app|cli)[/\\.]/i.test(line))
    .slice(0, 8);

  return {
    project: {
      name: nameFromManifest(vars.MANIFEST_DATA),
      description: 'Mock survey: this description came from the backend mock, not a model.',
      primary_language: 'JavaScript',
      secondary_languages: [],
      framework: null,
      package_manager: 'npm',
    },
    overview: {
      summary: 'Mock survey summary. The backend is in mock mode, so this text is a fixture.',
      entry_points: entryPoints.length ? entryPoints : ['index.js'],
      architecture_pattern: 'cli-router',
      total_files: totalFiles,
      total_lines: totalLines,
      has_tests: /test|spec/i.test(String(vars.FILE_INVENTORY || '')),
      test_coverage_estimate: 'partial',
    },
  };
}

function languageFor(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  return ({
    js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
    ts: 'TypeScript', tsx: 'TypeScript', json: 'JSON', md: 'Markdown',
    css: 'CSS', html: 'HTML', yml: 'YAML', yaml: 'YAML', sh: 'Shell',
  })[ext] || 'Text';
}

function complexityFor(lines) {
  if (lines > 400) return 'high';
  if (lines > 120) return 'medium';
  return 'low';
}

function filesPass(vars) {
  const batch = parseJson(vars.BATCH_DATA, []);

  const files = batch.map(item => {
    const lines = Number(item.lines) || String(item.content || '').split('\n').length || 1;
    return {
      path: item.path,
      language: pick(item.language, languageFor(item.path)),
      lines,
      purpose: `Mock analysis of ${item.path}.`,
      exports: [],
      imports: [],
      complexity: complexityFor(lines),
    };
  });

  const nodes = files.map(f => ({
    id: f.path,
    label: f.path.split('/').pop(),
    type: 'module',
    file: f.path,
    line: 1,
  }));

  // A single chain edge between consecutive files keeps the graph non-empty
  // without inventing relationships the source does not support.
  const edges = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id, kind: 'imports' });
  }

  return {
    files,
    techniques: [],
    impact_sight: {
      hotspots: files.slice(0, 3).map(f => ({
        file: f.path,
        reason: 'Mock hotspot: a large file in the batch.',
        risk: f.complexity,
      })),
      state_mutations: [],
      external_dependencies: [],
    },
    chakra_network: { nodes, edges },
  };
}

// The report and the Dojo both validate quiz structure, so the mock has to
// satisfy the same rules the prompt states: ten questions, five per group, at
// least three multiple choice in each, and a reference on every one.
function synthesize(vars) {
  const digest = String(vars.DIGEST || '');
  const files = Array.from(
    digest.matchAll(/^- (.+?) \(([^,]+), (\d+) lines/gm),
    m => ({ path: m[1], language: m[2], lines: Number(m[3]) })
  ).slice(0, 12);

  const nameOf = i => (files[i] ? files[i].path : `file-${i + 1}`);

  const mc = (id, intent, level, question, correct) => ({
    id,
    intent,
    level,
    type: 'multiple_choice',
    question,
    options: [
      `${nameOf(0)} only`,
      `${nameOf(1)} and ${nameOf(2)}`,
      `${nameOf(3)} through the whole tree`,
      'It cannot be determined from the analysis',
    ],
    correct,
    ideal_answer: `${nameOf(Number(correct))} — mock answer from the backend fixture.`,
    explanation: 'Mock explanation. The backend is in mock mode, so this is a fixture.',
    references: [`${nameOf(Number(correct))}:1`],
  });

  const short = (id, intent, level, question) => ({
    id,
    intent,
    level,
    type: 'short_answer',
    question,
    options: [],
    correct: '',
    ideal_answer: `Look at ${nameOf(Number(id.slice(1)) - 1)}.`,
    explanation: 'Mock explanation. The backend is in mock mode, so this is a fixture.',
    references: [`${nameOf(Number(id.slice(1)) - 1)}:1`],
  });

  const questions = [
    mc('q1', 'modification', 3, 'Mock: which files would you expect to touch for a change here?', 'A'),
    mc('q2', 'modification', 3, 'Mock: where does request handling begin?', 'B'),
    short('q3', 'modification', 3, 'Mock: which module owns the shared state?'),
    mc('q4', 'modification', 3, 'Mock: what is the blast radius of a change to the core?', 'A'),
    short('q5', 'modification', 3, 'Mock: name the external dependency most at risk.'),
    mc('q6', 'onboarding', 1, 'Mock: which file should a newcomer read first?', 'C'),
    mc('q7', 'onboarding', 1, 'Mock: what does this project do?', 'B'),
    short('q8', 'onboarding', 1, 'Mock: where do the tests live?'),
    mc('q9', 'onboarding', 1, 'Mock: which directory holds the business logic?', 'A'),
    short('q10', 'onboarding', 1, 'Mock: what command runs the test suite?'),
  ];

  return {
    chakra_network: { edges: [] },
    hotspots: files.slice(0, 6).map(f => ({
      file: f.path,
      reason: 'Mock hotspot: appears in many digests.',
      risk: complexityFor(f.lines),
    })),
    quiz: { questions },
  };
}

// --- prose tasks -----------------------------------------------------------

function prose(task, vars) {
  const subject = vars.FILE_PATH || vars.PROJECT_NAME || 'this project';
  return [
    `**${subject}** — answered by the backend mock provider.`,
    '',
    'This is a fixture, not a real analysis. Set BYAKUGAN_MOCK=false and provide ' +
    'GROQ_API_KEY and HF_API_KEY to get model output.',
    '',
    `- task: \`${task}\``,
    `- lines: ${pick(vars.LINES, pick(vars.TOTAL_LINES, 'n/a'))}`,
    `- intent: ${pick(vars.INTENT, 'n/a')}`,
    '',
    'The purpose of this mode is to let the CLI and backend be exercised end to ' +
    'end without spending tokens, so that protocol problems show up here rather ' +
    'than in front of a user.',
  ].join('\n');
}

// --- dispatch --------------------------------------------------------------

function respond(task, vars, options) {
  switch (task) {
    case 'analyze_survey':     return JSON.stringify(survey(vars));
    case 'analyze_files':      return JSON.stringify(filesPass(vars));
    case 'analyze_synthesize': return JSON.stringify(synthesize(vars));
    case 'route':              return /\b(change|modify|refactor|rename|fix|add|remove|impact)\b/i.test(String(vars.QUESTION || '')) ? 'CHAT' : 'SEARCH';
    case 'explain':
    case 'impact':
    case 'chat':               return prose(task, vars);
    default:                   return prose(task, vars);
  }
}

async function complete(request) {
  const { task, variables, options } = request;
  log.debug('mock complete', { task, hasJson: Boolean(options && options.json) });

  return {
    text: respond(task, variables, options),
    finish_reason: 'stop',
    usage: { total_tokens: 64, prompt_tokens: 48, completion_tokens: 16 },
  };
}

async function completeStream(request, onDelta) {
  const { task, variables, options } = request;
  const text = respond(task, variables, options);

  // Emit in word-ish chunks so the client sees a real token stream.
  const chunks = text.match(/\S+\s*/g) || [text];
  for (const chunk of chunks) {
    if (typeof onDelta === 'function') onDelta(chunk);
    await new Promise(resolve => setTimeout(resolve, STREAM_DELAY_MS));
  }

  return {
    text,
    finish_reason: 'stop',
    usage: { total_tokens: 64, prompt_tokens: 48, completion_tokens: 16 },
  };
}

async function probe(model) {
  return {
    ok: true,
    model: model || config.genModel,
    mock: true,
    reply: 'mock ok',
  };
}

module.exports = { complete, completeStream, probe, embed: async (inputs) => inputs.map(embedOne), enabled: config.mock };
