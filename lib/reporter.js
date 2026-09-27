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

const SECTIONS = [
  { id: 'overview', file: 'overview.html', label: 'Overview', build: overviewData, when: () => true },
  { id: 'chakra-network', file: 'chakra-network.html', label: 'Chakra Network', build: chakraData, when: a => hasNodes(a) },
  { id: 'techniques', file: 'techniques.html', label: 'Techniques', build: techniquesData, when: a => (a.techniques || []).length > 0 },
  { id: 'impact-sight', file: 'impact-sight.html', label: 'Impact Sight', build: impactData, when: a => Boolean(a.impact_sight) },
  { id: 'files', file: 'files.html', label: 'Files', build: filesData, when: a => (a.files || []).length > 0 },
  { id: 'quiz', file: 'quiz.html', label: 'Quiz', build: quizData, when: a => ((a.quiz && a.quiz.questions) || []).length > 0 },
];

const INTENT_NOTES = {
  onboarding: 'Focus: understanding what this project does and where to start.',
  modification: 'Focus: understanding what to change and what breaks if you do.',
  migration: 'Focus: understanding external dependencies and upgrade paths.',
  documentation: 'Focus: understanding purpose, structure, and key concepts.',
};

const LEVEL_NAMES = { 1: 'Junior', 2: 'Mid', 3: 'Senior', 4: 'Lead', 5: 'GodMode' };
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
    cards,
    summary: mdToHtml(o.summary),
    entryPoints: o.entry_points || [],
  };
}

function hasNodes(analysis) {
  const cn = analysis.chakra_network;
  return Boolean(cn && cn.nodes && cn.nodes.length);
}

function chakraData(analysis) {
  const cn = analysis.chakra_network;
  const nodeMap = new Map();
  for (const n of cn.nodes) nodeMap.set(n.id, n);

  const adjacency = new Map();
  for (const n of cn.nodes) adjacency.set(n.id, []);
  for (const e of cn.edges || []) {
    if (adjacency.has(e.from)) adjacency.get(e.from).push({ to: e.to, kind: e.kind });
  }

  return {
    nodes: cn.nodes.map(n => ({
      label: n.label,
      type: n.type,
      file: n.file,
      deps: (adjacency.get(n.id) || []).map(d => ({
        label: (nodeMap.get(d.to) || {}).label || d.to,
        kind: d.kind,
      })),
    })),
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
      significance: t.significance || 'medium',
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
    hotspots: (impact.hotspots || []).map(h => ({ file: h.file, reason: mdInline(h.reason), risk: h.risk })),
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

// ── assembly ─────────────────────────────────────────────────────────────────

function buildHTML(analysis, profile) {
  const project = analysis.project || {};
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, 'report.css'), 'utf8');

  const active = SECTIONS.filter(s => s.when(analysis));
  const sections = active
    .map(s => render(tpl(path.join('sections', s.file)), s.build(analysis, profile)))
    .join('\n');

  const nav = active
    .map(s => `<a href="#${s.id}">${esc(s.label)}</a>`)
    .join('');

  return render(tpl('layout.html'), {
    // Escaped by the template, so the project name must not be escaped here.
    title: 'Byakugan — ' + (project.name || ''),
    styles,
    projectName: project.name,
    profileName: profile.name,
    intent: profile.intent,
    levelName: LEVEL_NAMES[profile.level] || String(profile.level),
    generatedAt: new Date().toLocaleString(),
    nav,
    sections,
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

async function generateReport(outputPath, projectPath) {
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

  return outFile;
}

module.exports = { generateReport, buildHTML, projectDir, clearTemplateCache };
