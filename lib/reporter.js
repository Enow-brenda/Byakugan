'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const ANALYSIS_FILE = path.join(process.cwd(), '.byakugan', 'analysis.json');
const PROFILE_FILE  = path.join(process.cwd(), '.byakugan', 'profile.json');

const LEVEL_NAMES = { 1: 'Junior', 2: 'Mid', 3: 'Senior', 4: 'Lead', 5: 'GodMode' };

// ─── helpers ────────────────────────────────────────────────────────────────

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

// ─── section renderers ───────────────────────────────────────────────────────

function renderOverview(analysis, profile) {
  const o = analysis.overview;
  const p = analysis.project;
  const intentNote = {
    onboarding:    'Focus: understanding what this project does and where to start.',
    modification:  'Focus: understanding what to change and what breaks if you do.',
    migration:     'Focus: understanding external dependencies and upgrade paths.',
    documentation: 'Focus: understanding purpose, structure, and key concepts.',
  }[profile.intent] || '';

  return `
<section id="overview" class="section">
  <h2>Overview</h2>
  ${intentNote ? `<p class="intent-note">${esc(intentNote)}</p>` : ''}
  <div class="card-grid">
    <div class="card"><span class="label">Project</span><span class="value">${esc(p.name)}</span></div>
    <div class="card"><span class="label">Language</span><span class="value">${esc(p.primary_language)}</span></div>
    <div class="card"><span class="label">Framework</span><span class="value">${esc(p.framework || '—')}</span></div>
    <div class="card"><span class="label">Package Manager</span><span class="value">${esc(p.package_manager || '—')}</span></div>
    <div class="card"><span class="label">Files</span><span class="value">${o.total_files}</span></div>
    <div class="card"><span class="label">Lines</span><span class="value">${o.total_lines.toLocaleString()}</span></div>
    <div class="card"><span class="label">Has Tests</span><span class="value">${o.has_tests ? 'Yes' : 'No'}</span></div>
    <div class="card"><span class="label">Test Coverage</span><span class="value">${esc(o.test_coverage_estimate || '—')}</span></div>
    <div class="card"><span class="label">Architecture</span><span class="value">${esc(o.architecture_pattern || '—')}</span></div>
  </div>
  <p class="summary">${esc(o.summary)}</p>
  ${o.entry_points && o.entry_points.length ? `
  <h3>Entry Points</h3>
  <ul>${o.entry_points.map(e => `<li><code>${esc(e)}</code></li>`).join('')}</ul>` : ''}
</section>`;
}

function renderChakraNetwork(analysis) {
  const cn = analysis.chakra_network;
  if (!cn || !cn.nodes || cn.nodes.length === 0) return '';

  const nodeMap = {};
  cn.nodes.forEach(n => { nodeMap[n.id] = n; });

  // Build adjacency list for display
  const adjacency = {};
  cn.nodes.forEach(n => { adjacency[n.id] = []; });
  cn.edges.forEach(e => {
    if (adjacency[e.from]) adjacency[e.from].push({ to: e.to, kind: e.kind });
  });

  const rows = cn.nodes.map(n => {
    const deps = adjacency[n.id] || [];
    return `<tr>
      <td><code>${esc(n.label)}</code></td>
      <td><span class="badge badge-${esc(n.type)}">${esc(n.type)}</span></td>
      <td>${esc(n.file || '—')}</td>
      <td>${deps.map(d => `<code>${esc((nodeMap[d.to] || {}).label || d.to)}</code> <span class="edge-kind">${esc(d.kind)}</span>`).join(', ') || '—'}</td>
    </tr>`;
  }).join('');

  return `
<section id="chakra-network" class="section">
  <h2>Chakra Network</h2>
  <p class="section-desc">Dependency graph — nodes are modules, classes, or functions; edges show how they connect.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Node</th><th>Type</th><th>File</th><th>Connects To</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function renderTechniques(analysis, profile) {
  const techniques = analysis.techniques || [];
  if (techniques.length === 0) return '';

  // For junior level (1), show all three concept-card fields prominently
  // For senior+ (3+), lead with occurrences
  const isJunior = profile.level <= 2;

  const cards = techniques.map(t => `
  <div class="technique-card significance-${esc(t.significance || 'medium')}">
    <div class="technique-header">
      <h3>${esc(t.name)}</h3>
      <span class="badge badge-${esc(t.category)}">${esc(t.category)}</span>
      ${t.significance ? `<span class="sig-badge">${esc(t.significance)}</span>` : ''}
    </div>
    ${isJunior ? `
    <dl class="concept-card">
      <dt>What it is</dt><dd>${esc(t.what_it_is)}</dd>
      <dt>Why it matters</dt><dd>${esc(t.why_it_matters)}</dd>
      <dt>Without it</dt><dd>${esc(t.without_it)}</dd>
    </dl>` : `
    <p>${esc(t.what_it_is)}</p>`}
    ${t.occurrences && t.occurrences.length ? `
    <details>
      <summary>Occurrences (${t.occurrences.length})</summary>
      ${t.occurrences.map(o => `
      <div class="occurrence">
        <code class="file-ref">${esc(o.file)}:${o.line}</code>
        <pre class="snippet">${esc(o.snippet)}</pre>
      </div>`).join('')}
    </details>` : ''}
  </div>`).join('');

  return `
<section id="techniques" class="section">
  <h2>Techniques</h2>
  <p class="section-desc">Patterns, idioms, and notable code techniques found in this codebase.</p>
  <div class="technique-grid">${cards}</div>
</section>`;
}

function renderImpactSight(analysis, profile) {
  const impact = analysis.impact_sight;
  if (!impact) return '';

  // Only show full impact detail for modification / migration intents
  const fullDetail = profile.intent === 'modification' || profile.intent === 'migration';

  const hotspots = (impact.hotspots || []).map(h => `
  <tr>
    <td><code>${esc(h.file)}</code></td>
    <td>${esc(h.reason)}</td>
    <td><span class="risk-badge risk-${esc(h.risk)}">${esc(h.risk)}</span></td>
  </tr>`).join('');

  const mutations = fullDetail
    ? (impact.state_mutations || []).map(m => `
  <tr>
    <td><code>${esc(m.file)}</code></td>
    <td><code>${esc(m.symbol)}</code></td>
    <td>${esc(m.kind)}</td>
  </tr>`).join('')
    : '';

  const deps = (impact.external_dependencies || []).map(d => `
  <tr>
    <td><code>${esc(d.name)}</code></td>
    <td>${d.is_dev_only ? 'Dev only' : 'Runtime'}</td>
    <td>${(d.used_in || []).map(f => `<code>${esc(f)}</code>`).join(', ')}</td>
  </tr>`).join('');

  return `
<section id="impact-sight" class="section">
  <h2>Impact Sight</h2>
  <p class="section-desc">Change risk, hotspots, and dependency exposure.</p>

  ${hotspots ? `
  <h3>Hotspots</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>File</th><th>Reason</th><th>Risk</th></tr></thead>
      <tbody>${hotspots}</tbody>
    </table>
  </div>` : ''}

  ${fullDetail && mutations ? `
  <h3>State Mutations</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>File</th><th>Symbol</th><th>Scope</th></tr></thead>
      <tbody>${mutations}</tbody>
    </table>
  </div>` : ''}

  ${deps ? `
  <h3>External Dependencies</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Package</th><th>Type</th><th>Used In</th></tr></thead>
      <tbody>${deps}</tbody>
    </table>
  </div>` : ''}
</section>`;
}

function renderFiles(analysis, profile) {
  const files = analysis.files || [];
  if (files.length === 0) return '';

  const isJunior = profile.level <= 2;

  const rows = files.map(f => `
  <tr>
    <td><code>${esc(f.path)}</code></td>
    <td>${esc(f.language)}</td>
    <td>${f.lines}</td>
    <td>${esc(f.purpose)}</td>
    <td><span class="complexity-badge complexity-${esc(f.complexity)}">${esc(f.complexity)}</span></td>
    ${!isJunior ? `<td>${(f.exports || []).map(e => `<code title="${esc(e.signature)}">${esc(e.name)}</code>`).join(', ') || '—'}</td>` : ''}
  </tr>`).join('');

  return `
<section id="files" class="section">
  <h2>Files</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Path</th><th>Language</th><th>Lines</th><th>Purpose</th><th>Complexity</th>
          ${!isJunior ? '<th>Exports</th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function renderQuiz(analysis, profile) {
  const questions = (analysis.quiz && analysis.quiz.questions) || [];
  // Filter to matching intent + level; fall back to all if no match
  let filtered = questions.filter(q => q.intent === profile.intent && q.level === profile.level);
  if (filtered.length === 0) filtered = questions;
  if (filtered.length === 0) return '';

  const items = filtered.map((q, i) => {
    const isMC = q.type === 'multiple_choice';
    return `
  <div class="quiz-item" id="quiz-${esc(q.id)}">
    <p class="quiz-q"><strong>Q${i + 1}.</strong> ${esc(q.question)}</p>
    ${isMC ? `
    <ul class="quiz-options">
      ${(q.options || []).map(opt => `<li class="quiz-opt" data-correct="${esc(q.correct)}" data-letter="${esc(opt[0])}">${esc(opt)}</li>`).join('')}
    </ul>
    <div class="quiz-feedback" style="display:none">
      <span class="correct-label">✓ Correct: ${esc(q.correct)}</span>
      <p class="explanation">${esc(q.explanation)}</p>
    </div>` : `
    <div class="quiz-short">
      <details>
        <summary>Show ideal answer</summary>
        <p>${esc(q.ideal_answer)}</p>
        <p class="explanation">${esc(q.explanation)}</p>
      </details>
    </div>`}
    ${q.references && q.references.length ? `<p class="quiz-refs">References: ${q.references.map(r => `<code>${esc(r)}</code>`).join(', ')}</p>` : ''}
  </div>`;
  }).join('');

  return `
<section id="quiz" class="section">
  <h2>Quiz</h2>
  <p class="section-desc">Questions tailored for <strong>${esc(profile.intent)}</strong> intent at <strong>${esc(LEVEL_NAMES[profile.level] || profile.level)}</strong> level.</p>
  <div class="quiz-list">${items}</div>
</section>`;
}

// ─── HTML shell ──────────────────────────────────────────────────────────────

function buildHTML(analysis, profile) {
  const title = `Byakugan — ${esc(analysis.project.name)}`;
  const levelName = LEVEL_NAMES[profile.level] || String(profile.level);
  const generatedAt = new Date().toLocaleString();

  const nav = ['overview', 'chakra-network', 'techniques', 'impact-sight', 'files', 'quiz']
    .map(id => `<a href="#${id}">${id.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</a>`)
    .join('');

  const sections = [
    renderOverview(analysis, profile),
    renderChakraNetwork(analysis),
    renderTechniques(analysis, profile),
    renderImpactSight(analysis, profile),
    renderFiles(analysis, profile),
    renderQuiz(analysis, profile),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; font-size: 14px;
         line-height: 1.6; background: #f7f8fa; color: #1f2328; }
  a { color: #3b82d4; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: "Cascadia Code", "Fira Code", monospace; font-size: 0.87em;
         background: #eef0f3; padding: 1px 5px; border-radius: 3px; }
  pre.snippet { background: #1e1e2e; color: #cdd6f4; padding: 10px 14px; border-radius: 6px;
                font-size: 0.82em; overflow-x: auto; margin-top: 6px; white-space: pre-wrap; }

  /* Header */
  .site-header { background: #1f2328; color: #fff; padding: 18px 32px;
                 display: flex; align-items: center; justify-content: space-between; }
  .site-header h1 { font-size: 1.2rem; font-weight: 600; }
  .header-meta { font-size: 0.8rem; color: #8b949e; }

  /* Nav */
  nav { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 0 32px;
        display: flex; gap: 4px; overflow-x: auto; }
  nav a { display: block; padding: 10px 14px; font-size: 0.82rem; font-weight: 500;
           color: #57606a; border-bottom: 2px solid transparent; white-space: nowrap; }
  nav a:hover { color: #1f2328; border-bottom-color: #3b82d4; text-decoration: none; }

  /* Layout */
  main { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  .section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
             padding: 28px 32px; margin-bottom: 28px; }
  .section h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 16px;
                padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
  .section h3 { font-size: 0.95rem; font-weight: 600; margin: 20px 0 10px; }
  .section-desc { font-size: 0.85rem; color: #57606a; margin-bottom: 16px; }
  .intent-note { background: #eff6ff; border-left: 3px solid #3b82d4;
                 padding: 8px 14px; border-radius: 0 4px 4px 0; font-size: 0.85rem;
                 color: #1d4ed8; margin-bottom: 16px; }
  .summary { margin-top: 16px; color: #444; }

  /* Cards */
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
               gap: 12px; margin-bottom: 16px; }
  .card { background: #f7f8fa; border: 1px solid #e5e7eb; border-radius: 6px;
          padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
  .card .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
                 color: #57606a; font-weight: 600; }
  .card .value { font-size: 0.9rem; font-weight: 500; color: #1f2328; }

  /* Badges */
  .badge { display: inline-block; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px;
           font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .badge-module    { background: #dbeafe; color: #1d4ed8; }
  .badge-class     { background: #ede9fe; color: #6d28d9; }
  .badge-function  { background: #dcfce7; color: #166534; }
  .badge-external  { background: #fef3c7; color: #92400e; }
  .badge-design-pattern   { background: #dbeafe; color: #1e40af; }
  .badge-language-feature { background: #dcfce7; color: #15803d; }
  .badge-anti-pattern     { background: #fee2e2; color: #991b1b; }
  .sig-badge { font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; font-weight: 500;
               background: #f3f4f6; color: #374151; margin-left: 6px; }
  .risk-badge { display: inline-block; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; font-weight: 600; }
  .risk-high   { background: #fee2e2; color: #991b1b; }
  .risk-medium { background: #fef3c7; color: #92400e; }
  .risk-low    { background: #dcfce7; color: #166534; }
  .complexity-badge { display: inline-block; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; font-weight: 600; }
  .complexity-high   { background: #fee2e2; color: #991b1b; }
  .complexity-medium { background: #fef3c7; color: #92400e; }
  .complexity-low    { background: #dcfce7; color: #166534; }
  .edge-kind { font-size: 0.7rem; color: #57606a; }

  /* Tables */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; font-weight: 600; font-size: 0.75rem; text-transform: uppercase;
       letter-spacing: 0.04em; color: #57606a; padding: 8px 12px;
       border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
  td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f7f8fa; }

  /* Techniques */
  .technique-grid { display: flex; flex-direction: column; gap: 16px; }
  .technique-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px 20px; }
  .technique-card.significance-high { border-left: 3px solid #ef4444; }
  .technique-card.significance-medium { border-left: 3px solid #f59e0b; }
  .technique-card.significance-low { border-left: 3px solid #10b981; }
  .technique-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .technique-header h3 { font-size: 0.95rem; margin: 0; }
  .concept-card { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px;
                  font-size: 0.85rem; margin-bottom: 10px; }
  .concept-card dt { font-weight: 600; color: #57606a; white-space: nowrap; }
  .concept-card dd { color: #1f2328; }
  .occurrence { margin-top: 10px; }
  .file-ref { font-size: 0.78rem; color: #57606a; }
  details summary { cursor: pointer; font-size: 0.82rem; color: #3b82d4; margin-top: 8px; }

  /* Quiz */
  .quiz-list { display: flex; flex-direction: column; gap: 20px; }
  .quiz-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px 20px; }
  .quiz-q { font-weight: 500; margin-bottom: 12px; }
  .quiz-options { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .quiz-opt { padding: 8px 14px; border: 1px solid #e5e7eb; border-radius: 6px;
              cursor: pointer; font-size: 0.88rem; transition: background 0.15s; }
  .quiz-opt:hover { background: #f0f6ff; border-color: #3b82d4; }
  .quiz-opt.selected-correct { background: #dcfce7; border-color: #16a34a; }
  .quiz-opt.selected-wrong   { background: #fee2e2; border-color: #dc2626; }
  .quiz-feedback { margin-top: 10px; padding: 10px 14px; background: #f0fdf4;
                   border: 1px solid #bbf7d0; border-radius: 6px; font-size: 0.85rem; }
  .correct-label { font-weight: 600; color: #16a34a; display: block; margin-bottom: 4px; }
  .explanation { color: #374151; margin-top: 4px; }
  .quiz-short details p { margin-top: 8px; font-size: 0.88rem; }
  .quiz-refs { font-size: 0.78rem; color: #57606a; margin-top: 10px; }
</style>
</head>
<body>
<header class="site-header">
  <h1>👁 Byakugan &mdash; ${esc(analysis.project.name)}</h1>
  <span class="header-meta">
    ${esc(profile.name)} &middot; ${esc(profile.intent)} &middot; ${esc(levelName)}
    &nbsp;|&nbsp; Generated ${esc(generatedAt)}
  </span>
</header>
<nav>${nav}</nav>
<main>${sections}</main>
<script>
  // Quiz interactivity — select an option, reveal feedback
  document.querySelectorAll('.quiz-opt').forEach(function(opt) {
    opt.addEventListener('click', function() {
      var item = opt.closest('.quiz-item');
      if (item.dataset.answered) return;
      item.dataset.answered = '1';
      var correct = opt.dataset.correct;
      var letter = opt.dataset.letter;
      item.querySelectorAll('.quiz-opt').forEach(function(o) {
        if (o.dataset.letter === correct) o.classList.add('selected-correct');
        else if (o === opt) o.classList.add('selected-wrong');
      });
      var fb = item.querySelector('.quiz-feedback');
      if (fb) fb.style.display = 'block';
    });
  });
</script>
</body>
</html>`;
}

// ─── public API ──────────────────────────────────────────────────────────────

function generateReport(outputPath) {
  console.log(chalk.cyan('› Reading analysis...'));
  const analysis = readJSON(ANALYSIS_FILE, 'analysis.json');

  console.log(chalk.cyan('› Reading profile...'));
  const profile = readJSON(PROFILE_FILE, 'profile.json');

  console.log(chalk.cyan('› Rendering report...'));
  const html = buildHTML(analysis, profile);

  const outFile = outputPath || path.join(process.cwd(), '.byakugan', 'report.html');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');

  return outFile;
}

module.exports = { generateReport };
