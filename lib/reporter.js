'use strict';

// Renders the static HTML report.
//
// All markup lives in templates/report/ (see the README there); this file only
// reshapes analysis.json into the plain data those templates expect. It never
// calls an LLM.

const fs = require('fs');
const path = require('path');
const ui = require('./ui');
const { render } = require('./template');
const { mdToHtml, mdInline } = require('./markdown');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'report');

// Sidebar glyphs. App-generated markup, so they are emitted into a {{{ }}} slot.
// Kept as plain path data (no fill on the svg element) so CSS owns the colour.
const ICONS = {
  'overview': '<path d="M12 3 3 8v8l9 5 9-5V8z"/><path d="M12 8v13M7 10.5l10 5M17 10.5l-10 5"/>',
  'chakra-network': '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M12 7.4 5 15.6M12 7.4l7 8.2M7.4 18h9.2"/>',
  'techniques': '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
  'impact-sight': '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
  'files': '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h3.2l1.6 2h8.2A1.5 1.5 0 0 1 20 7.5v11A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z"/>',
  'quiz': '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.3 3.2v1.3"/><path d="M12 17.2h.01"/>',
};

function icon(name) {
  const body = ICONS[name];
  if (!body) return '';
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
}

const SECTIONS = [
  { id: 'overview', file: 'overview.html', label: 'Mission Dossier', blurb: 'What this project is, at a glance', build: overviewData, when: () => true },
  { id: 'chakra-network', file: 'chakra-network.html', label: 'Chakra Flow', blurb: 'How the pieces feed each other', build: chakraData, when: a => hasNodes(a) },
  { id: 'techniques', file: 'techniques.html', label: 'Jutsu Library', blurb: 'Techniques this codebase uses', build: techniquesData, when: a => (a.techniques || []).length > 0 },
  { id: 'impact-sight', file: 'impact-sight.html', label: 'Fovea Vision', blurb: 'What breaks, and what pulls', build: impactData, when: a => Boolean(a.impact_sight) },
  { id: 'files', file: 'files.html', label: 'Shinobi Registry', blurb: 'Every file and its purpose', build: filesData, when: a => (a.files || []).length > 0 },
  { id: 'quiz', file: 'quiz.html', label: 'The Dojo', blurb: 'Prove what you absorbed', build: quizData, when: a => ((a.quiz && a.quiz.questions) || []).length > 0 },
];

const INTENT_NOTES = {
  onboarding: 'Focus: understanding what this project does and where to start.',
  modification: 'Focus: understanding what to change and what breaks if you do.',
  migration: 'Focus: understanding external dependencies and upgrade paths.',
  documentation: 'Focus: understanding purpose, structure, and key concepts.',
};

// The reader's level drives both the plain label used in prose and the ninja
// rank shown in the header, so the two can never drift apart.
const LADDER = [
  { level: 1, name: 'Academy Student', rank: 'Academy', tone: 'r1' },
  { level: 2, name: 'Mid',              rank: 'Genin',   tone: 'r2' },
  { level: 3, name: 'Senior',           rank: 'Chunin',  tone: 'r3' },
  { level: 4, name: 'Lead',             rank: 'Jonin',   tone: 'r4' },
  { level: 5, name: 'GodMode',          rank: 'Hokage',  tone: 'r5' },
];
const LEVEL_NAMES = LADDER.reduce((m, s) => { m[s.level] = s.name; return m; }, {});
const MAX_LEVEL = LADDER.length;

function rankFor(level) {
  const n = Number(level);
  return LADDER.find(s => s.level === n) || LADDER[0];
}

// Every rung, flagged so the template can light the ones already earned.
function ladderData(profile) {
  const current = rankFor(profile.level).level;
  return LADDER.map(s => ({
    rank: s.rank,
    name: s.name,
    tone: s.tone,
    reached: s.level <= current,
    current: s.level === current,
  }));
}

// Model-written severity ends up in class names and in a CSS custom property,
// so it is narrowed to a fixed set before it ever reaches a template. Anything
// unrecognised reads as "medium" rather than inventing a new state.
const SEVERITY = ['high', 'medium', 'low'];
function severity(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  return SEVERITY.includes(v) ? v : 'medium';
}

// intent -> the directive shown as a stamped ribbon on the dossier.
const INTENT_MISSIONS = {
  onboarding:    { code: 'RECON', directive: 'Build a map of this village before you move.' },
  modification:  { code: 'STRIKE', directive: 'Know what breaks before you break it.' },
  migration:     { code: 'EXTRACT', directive: 'Find every rope tied to the outside world.' },
  documentation: { code: 'ARCHIVE', directive: 'Capture what this place is and why it works.' },
};
const DASH = '—';

function projectDir(projectPath) {
  return projectPath ? path.resolve(projectPath) : process.cwd();
}

function resolveProfile(projectPath) {
  const candidates = [
    path.join(projectDir(projectPath), '.byakugan', 'profile.json'),
    path.join(process.cwd(), '.byakugan', 'profile.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return candidates[0];
}

function readJSON(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}. Run the required command first.`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${label}: ${err.message}`);
  }
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Templates are read once per process; the report is rendered in a single pass.
const templateCache = new Map();
function tpl(name) {
  if (!templateCache.has(name)) {
    const file = path.join(TEMPLATE_DIR, name);
    templateCache.set(name, fs.readFileSync(file, 'utf8'));
  }
  return templateCache.get(name);
}

// Drops templates/report/ from the cache. Only useful when editing templates in
// a long-lived process; not needed by the CLI.
function clearTemplateCache() {
  templateCache.clear();
}

function orDash(value) {
  return value == null || value === '' ? DASH : value;
}

// The report renders model-written prose as Markdown. Both helpers escape first
// and only then apply formatting, so a field can be passed to a {{{ }}} slot in
// the template. Identifiers, code and anything interpolated into a class or
// attribute deliberately skip this and stay plain {{ }}.

// ── section data ─────────────────────────────────────────────────────────────

function overviewData(analysis, profile) {
  const o = analysis.overview || {};
  const p = analysis.project || {};

  const cards = [
    ['Project', p.name],
    ['Language', p.primary_language],
    ['Framework', orDash(p.framework)],
    ['Package Manager', orDash(p.package_manager)],
    ['Files', o.total_files],
    ['Lines', typeof o.total_lines === 'number' ? o.total_lines.toLocaleString() : o.total_lines],
    ['Has Tests', o.has_tests ? 'Yes' : 'No'],
    ['Test Coverage', orDash(o.test_coverage_estimate)],
    ['Architecture', orDash(o.architecture_pattern)],
  ].map(([label, value]) => ({ label, value: mdInline(value) }));

  return {
    intentNote: INTENT_NOTES[profile.intent] || '',
    mission: INTENT_MISSIONS[profile.intent] || { code: 'SCOUT', directive: INTENT_NOTES[profile.intent] || '' },
    rank: rankFor(profile.level),
    levelPct: Math.round((rankFor(profile.level).level / MAX_LEVEL) * 100),
    ladder: ladderData(profile),
    cards,
    summary: mdToHtml(o.summary),
    entryPoints: o.entry_points || [],
  };
}

function hasNodes(analysis) {
  const cn = analysis.chakra_network;
  return Boolean(cn && cn.nodes && cn.nodes.length);
}

// A graph this size is still readable; a 300-node hairball is not, and the point
// of the chakra network is to show shape. Nodes are ranked by how many edges
// touch them, so the ones that matter survive the cut.
const GRAPH_MAX_NODES = 60;

const NODE_TYPES = ['module', 'class', 'function', 'external'];
const EDGE_KINDS = ['imports', 'calls', 'extends', 'implements'];

// Column index per node, counting outward from the things nothing depends on.
// An edge runs from an importer to what it imports, so the entry points (the
// nodes with no incoming edge) land in the first column and the libraries they
// pull in fan out to the right, which is how a reader expects to follow a graph.
//
// Computed by memoised walk rather than a forward path search: cycles are normal
// in real code, and a forward walk that meets an already-placed node used to
// count one level too many. Recursion is bounded by the node cap.
function assignDepths(keep, edges) {
  const keepSet = new Set(keep);
  const parents = new Map();
  for (const id of keep) parents.set(id, []);
  for (const e of edges) {
    if (keepSet.has(e.from) && keepSet.has(e.to)) parents.get(e.to).push(e.from);
  }

  const depth = new Map();
  const walking = new Set();
  function walk(id) {
    if (depth.has(id)) return depth.get(id);
    // Already on this stack means a cycle. Counting it as a root keeps the walk
    // moving; the edge itself is still drawn.
    if (walking.has(id)) return 0;
    walking.add(id);
    let deepest = -1;
    for (const parent of parents.get(id)) deepest = Math.max(deepest, walk(parent));
    walking.delete(id);
    const value = deepest < 0 ? 0 : deepest + 1;
    depth.set(id, value);
    return value;
  }
  for (const id of keep) walk(id);
  return depth;
}

function chakraData(analysis) {
  const cn = analysis.chakra_network || {};
  const all = cn.nodes || [];
  const nodeMap = new Map();
  for (const n of all) nodeMap.set(n.id, n);

  const adjacency = new Map();
  for (const n of all) adjacency.set(n.id, []);
  const degree = new Map();
  const bump = (k) => degree.set(k, (degree.get(k) || 0) + 1);
  for (const e of cn.edges || []) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
    adjacency.get(e.from).push({ to: e.to, kind: e.kind });
    bump(e.from);
    bump(e.to);
  }

  const ranked = all.slice().sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
  const kept = ranked.slice(0, GRAPH_MAX_NODES);
  const keep = kept.map(n => n.id);
  const keepSet = new Set(keep);

  // Edges pointing at a node that was cut would dangle in the graph and render as
  // a line to nowhere, so they are dropped along with the nodes.
  const edges = [];
  for (const e of cn.edges || []) {
    if (!keepSet.has(e.from) || !keepSet.has(e.to) || e.from === e.to) continue;
    if (edges.some(x => x.from === e.from && x.to === e.to)) continue;
    edges.push({ from: e.from, to: e.to, kind: EDGE_KINDS.includes(e.kind) ? e.kind : 'imports' });
  }

  const depths = assignDepths(keep, cn.edges || []);
  const nodes = kept.map(n => ({
    id: n.id,
    label: n.label || n.id,
    type: NODE_TYPES.includes(n.type) ? n.type : 'module',
    file: n.file || '',
    degree: degree.get(n.id) || 0,
    depth: depths.get(n.id) || 0,
    deps: (adjacency.get(n.id) || [])
      .filter(d => keepSet.has(d.to))
      .map(d => ({ label: (nodeMap.get(d.to) || {}).label || d.to, kind: d.kind })),
  }));

  return {
    nodes,
    graph: { nodes, edges },
    nodeTypes: NODE_TYPES,
    edgeKinds: EDGE_KINDS,
    shownCount: nodes.length,
    totalCount: all.length,
    hiddenCount: Math.max(0, all.length - nodes.length),
    edgeCount: edges.length,
  };
}

function techniquesData(analysis, profile) {
  const detailed = profile.level <= 2;
  return {
    techniques: (analysis.techniques || []).map(t => ({
      name: mdInline(t.name),
      category: t.category,
      // Drives the card's border colour, so it needs a fallback; the badge is
      // only shown when the model actually said something about significance.
      significance: severity(t.significance),
      sigBadge: t.significance || '',
      whatItIs: mdToHtml(t.what_it_is),
      whyItMatters: mdToHtml(t.why_it_matters),
      withoutIt: mdToHtml(t.without_it),
      detailed,
      occurrenceCount: (t.occurrences || []).length,
      occurrences: (t.occurrences || []).map(o => ({
        file: o.file,
        line: o.line,
        // Code, not prose: escaped only, never treated as Markdown.
        snippet: o.snippet,
      })),
    })),
  };
}

function impactData(analysis, profile) {
  const impact = analysis.impact_sight || {};
  const fullDetail = profile.intent === 'modification' || profile.intent === 'migration';

  return {
    hotspots: (impact.hotspots || []).map(h => ({ file: h.file, reason: mdInline(h.reason), risk: severity(h.risk) })),
    // Suppressed for readers who did not ask about change impact.
    mutations: fullDetail
      ? (impact.state_mutations || []).map(m => ({ file: m.file, symbol: m.symbol, kind: m.kind }))
      : [],
    dependencies: (impact.external_dependencies || []).map(d => ({
      name: d.name,
      type: d.is_dev_only ? 'Dev only' : 'Runtime',
      usedIn: d.used_in || [],
    })),
  };
}

function filesData(analysis, profile) {
  const showExports = profile.level > 2;
  return {
    showExports,
    files: (analysis.files || []).map(f => ({
      path: f.path,
      language: f.language,
      lines: f.lines,
      purpose: mdInline(f.purpose),
      complexity: f.complexity,
      exports: showExports ? (f.exports || []) : [],
    })),
  };
}

function quizData(analysis, profile) {
  const questions = (analysis.quiz && analysis.quiz.questions) || [];
  const matches = (q) => q.intent === profile.intent && q.level === profile.level;
  const rank = rankFor(profile.level);

  // Questions matching the reader's profile come first; the rest still follow.
  const ordered = [
    ...questions.filter(matches),
    ...questions.filter(q => !matches(q)),
  ];

  return {
    total: questions.length,
    tailored: questions.filter(matches).length,
    intent: profile.intent,
    levelName: LEVEL_NAMES[profile.level] || String(profile.level),
    rankName: rank.rank,
    rankTone: rank.tone,
    questions: ordered.map((q, i) => {
      const ideal = q.ideal_answer == null ? '' : String(q.ideal_answer).trim();
      const why = q.explanation == null ? '' : String(q.explanation).trim();
      return {
        id: q.id,
        number: i + 1,
        question: mdInline(q.question),
        tailored: matches(q),
        multipleChoice: q.type === 'multiple_choice',
        // Used as a data- attribute and a label: keep it plain and escaped.
        correct: q.correct,
        options: (q.options || []).map(opt => ({
          letter: opt.charAt(0),
          text: mdInline(opt),
        })),
        idealAnswer: mdToHtml(q.ideal_answer),
        // Multiple-choice answers carry an ideal_answer as well as an
        // explanation, and the two are not interchangeable. Show it, but only
        // when it actually says something the explanation does not.
        showIdeal: q.type === 'multiple_choice' && ideal !== '' && ideal !== why,
        explanation: mdToHtml(q.explanation),
        references: q.references || [],
      };
    }),  };
}

// JSON for a <script type="application/json"> block. The browser never runs
// that block, but the HTML parser still ends it at the first "</script" - so a
// node label containing that string would break out and the rest of the label
// would be parsed as markup. Escaping "<" as "<" removes the only sequence
// that can close the element. "&" and the two line separators are escaped so
// the payload also survives being embedded in a way that decodes entities.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ── assembly ─────────────────────────────────────────────────────────────────

function buildNav(active, analysis) {
  const counts = {
    'overview': null,
    'chakra-network': ((analysis.chakra_network || {}).nodes || []).length,
    'techniques': (analysis.techniques || []).length,
    'impact-sight': ((analysis.impact_sight || {}).hotspots || []).length,
    'files': (analysis.files || []).length,
    'quiz': (((analysis.quiz || {}).questions) || []).length,
  };
  const fmt = n => (n == null || n === 0 ? '' : n > 999 ? (n / 1000).toFixed(1) + 'k' : String(n));

  return render(tpl('nav.html'), {
    items: active.map(s => ({
      id: s.id,
      label: s.label,
      blurb: s.blurb,
      icon: icon(s.id),
      count: fmt(counts[s.id]),
    })),
  });
}

function buildHTML(analysis, profile) {
  const project = analysis.project || {};
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, 'report.css'), 'utf8');
  const scripts = fs.readFileSync(path.join(TEMPLATE_DIR, 'report.js'), 'utf8');

  const active = SECTIONS.filter(s => s.when(analysis));
  // Each section's data is built once and reused: the chakra graph needs the
  // same shaped object both to render its table and to drive the SVG layout.
  const built = new Map();
  const sections = active
    .map(s => {
      const data = s.build(analysis, profile);
      built.set(s.id, data);
      return render(tpl(path.join('sections', s.file)), data);
    })
    .join('\n');

  const rank = rankFor(profile.level);
  const graph = built.get('chakra-network');

  return render(tpl('layout.html'), {
    // Escaped by the template, so the project name must not be escaped here.
    title: 'Byakugan — ' + (project.name || ''),
    styles,
    scripts,
    projectName: project.name,
    profileName: profile.name,
    intent: profile.intent,
    levelName: LEVEL_NAMES[profile.level] || String(profile.level),
    rankName: rank.rank,
    rankTone: rank.tone,
    level: rank.level,
    levelMax: MAX_LEVEL,
    levelPct: Math.round((rank.level / MAX_LEVEL) * 100),
    ladder: ladderData(profile),
    generatedAt: new Date().toLocaleString(),
    nav: buildNav(active, analysis),
    sections,
    // The browser re-derives positions, but it needs the full node records to do
    // it: id, label, type, file, depth and degree all end up on screen.
    graph: graph ? jsonForScript(graph.graph) : '',
  });
}

async function loadProfile(projectPath) {
  const existing = resolveProfile(projectPath);
  if (fs.existsSync(existing)) return readJSON(existing, 'profile.json');

  ui.warn('no profile yet — a few questions so the report can adapt to you');
  const { profile } = require('./profiler');
  await profile({ projectPath });

  const created = path.join(projectDir(projectPath), '.byakugan', 'profile.json');
  return readJSON(created, 'profile.json');
}

// Hands the finished file to the OS browser. A report you cannot see is a
// report nobody reads, so this is on by default; `--no-open` turns it off for CI
// and for when the file is being written somewhere other than this machine.
//
// The child is detached and its output discarded because the opener is a GUI
// process that outlives us and would otherwise hold the CLI's pipes open.
function openInBrowser(file) {
  const target = path.resolve(file);
  let cmd;
  let args;
  if (process.platform === 'win32') {
    // start is a cmd builtin, so it has to be reached through the shell, and the
    // empty string is the window title `start` would otherwise take from the path.
    cmd = 'cmd';
    args = ['/c', 'start', '', target];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [target];
  } else {
    cmd = 'xdg-open';
    args = [target];
  }
  return new Promise(resolve => {
    let child;
    try {
      child = require('child_process').spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    // Nothing is awaited: the point is to hand the file over, not to babysit the
    // browser. unref lets the CLI exit immediately even though the child lives.
    child.unref();
    resolve(true);
  });
}

async function generateReport(outputPath, projectPath, options) {
  const opts = options || {};
  const dir = projectDir(projectPath);
  const analysisFile = path.join(dir, '.byakugan', 'analysis.json');

  ui.begin('report', outputPath ? ui.truncate(path.resolve(outputPath), ui.termWidth() - 16) : '');

  if (!fs.existsSync(analysisFile)) {
    ui.warn('no analysis found for this directory');
    const readline = require('readline');
    const targetPath = await new Promise((resolve) => {
      const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
      // Same wording as the identical chat.js prompt, now through one helper.
      ui.prompt('path to codebase to analyze (Enter to cancel)');
      tmp.question('', (ans) => {
        tmp.close();
        resolve(ans.trim());
      });
    });
    if (!targetPath) {
      throw new Error('No analysis found. Run `byakugan analyze <path>` first.');
    }
    const { analyze } = require('./analyzer');
    await analyze(targetPath);
  }

  const readPhase = ui.createPhase('read analysis');
  const analysis = readJSON(analysisFile, 'analysis.json');
  readPhase.advance();
  readPhase.done();

  const profile = await loadProfile(projectPath);

  const renderPhase = ui.createPhase('render report');
  const html = buildHTML(analysis, profile);
  renderPhase.advance();

  const outFile = outputPath || path.join(dir, '.byakugan', 'report.html');
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');
  renderPhase.done(path.relative(dir, outFile) || path.basename(outFile));

  // Off when explicitly disabled, or when the environment says so. Anything else
  // opens, because a report nobody sees is a report nobody reads.
  if (opts.open !== false && !process.env.BYAKUGAN_NO_OPEN) {
    const opened = await openInBrowser(outFile);
    if (opened) ui.success('byakugan activated', { detail: outFile });
    else ui.note('report written - open it yourself: ' + ui.truncate(outFile, ui.termWidth() - 24));
  }

  return outFile;
}

module.exports = {
  generateReport, buildHTML, openInBrowser, projectDir, clearTemplateCache,
  rankFor, ladderData, jsonForScript, GRAPH_MAX_NODES, NODE_TYPES, EDGE_KINDS,
};
