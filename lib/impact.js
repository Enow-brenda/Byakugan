'use strict';

const fs = require('fs');
const path = require('path');
const ui = require('./ui');
const llm = require('./llm');
const live = require('./livestream').live;

const PROMPT_FILE = path.join(__dirname, '..', 'templates', 'prompts', 'impact.md');

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

function buildImpactContext(analysis, fileEntry) {
  const filePath = fileEntry.path;
  const network = analysis.chakra_network || {};
  const nodes = network.nodes || [];
  const edges = network.edges || [];

  const fileNodeId = (() => {
    const n = nodes.find(n => n.file === filePath || n.id === filePath);
    return n ? n.id : filePath;
  })();

  const outEdges = edges.filter(e => e.from === fileNodeId);
  const inEdges  = edges.filter(e => e.to === fileNodeId);

  const nodeLabel = id => {
    const n = nodes.find(n => n.id === id);
    return n ? (n.label || id) : id;
  };

  const edgesText = [...inEdges, ...outEdges].length
    ? [
        ...inEdges.map(e => `  ${nodeLabel(e.from)} --${e.kind}--> ${nodeLabel(e.to)} (incoming)`),
        ...outEdges.map(e => `  ${nodeLabel(e.from)} --${e.kind}--> ${nodeLabel(e.to)} (outgoing)`),
      ].join('\n')
    : '  (none recorded)';

  const dependents = inEdges.length
    ? inEdges.map(e => `  ${nodeLabel(e.from)}`).join('\n')
    : '  (none recorded)';

  const dependencies = (fileEntry.imports || []).length
    ? fileEntry.imports.map(i => `  ${i.source}`).join('\n')
    : '  (none recorded)';

  const impact = analysis.impact_sight || {};

  const hotspot = (impact.hotspots || []).find(h => h.file === filePath);
  const hotspotText = hotspot
    ? `Risk: ${hotspot.risk}\nReason: ${hotspot.reason}`
    : '(not flagged as a hotspot)';

  const mutations = (impact.state_mutations || [])
    .filter(m => m.file === filePath);
  const mutationsText = mutations.length
    ? mutations.map(m => `  ${m.symbol} (${m.kind})`).join('\n')
    : '  (none recorded)';

  return { edgesText, dependents, dependencies, hotspotText, mutationsText };
}

async function impact(filePath, options = {}) {
  const dir = options.projectPath ? path.resolve(options.projectPath) : process.cwd();
  const byakuganDir = path.join(dir, '.byakugan');

  const analysis = readJSONFile(path.join(byakuganDir, 'analysis.json'), 'analysis.json');

  const fileEntry = findFile(analysis, filePath);

  const { edgesText, dependents, dependencies, hotspotText, mutationsText } =
    buildImpactContext(analysis, fileEntry);

  if (!fs.existsSync(PROMPT_FILE)) {
    throw new Error(`Impact prompt not found: ${PROMPT_FILE}`);
  }
  const template = fs.readFileSync(PROMPT_FILE, 'utf8');

  const prompt = fill(template, {
    PROJECT_NAME:  analysis.project.name,
    FILE_PATH:     fileEntry.path,
    LANGUAGE:      fileEntry.language,
    COMPLEXITY:    fileEntry.complexity,
    PURPOSE:       fileEntry.purpose || '(not recorded)',
    HOTSPOT:       hotspotText,
    DEPENDENTS:    dependents,
    DEPENDENCIES:  dependencies,
    EDGES:         edgesText,
    MUTATIONS:     mutationsText,
  });

  // One header, not two — see the matching note in explain.js.
  ui.begin('impact', fileEntry.path);
  ui.group('answer');
  ui.blank();

  const { text: raw } = await live({
    label: 'tracing dependents of ' + fileEntry.path,
    raw: options.raw,
    run: (onChunk) =>
      llm.stream([{ role: 'user', content: prompt }], { maxCompletionTokens: 4096 }, onChunk),
  });

  return raw;
}

module.exports = { impact };
