'use strict';

const fs = require('fs');
const path = require('path');
const llm = require('./llm');
const scanner = require('./scanner');
const batching = require('./batching');
const ui = require('./ui');
const trace = require('./trace');

const SCHEMA_VERSION = '1.0.0';

const EMBED_BATCH_SIZE = 16;
const EMBED_CONCURRENCY = 4;

const TOP_K = 3;

const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'setup.py', 'requirements.txt', 'go.mod',
  'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json',
  'Gemfile', 'mix.exs', 'pubspec.yaml', 'deno.json', 'deno.jsonc',
]);

const README_MAX_CHARS = 6000;

function outputDirFor(targetPath) {
  return path.join(targetPath, '.byakugan');
}

function analysisPaths(targetPath) {
  const dir = outputDirFor(targetPath);
  return {
    dir,
    analysis: path.join(dir, 'analysis.json'),
    embeddings: path.join(dir, 'embeddings.json'),
    partial: path.join(dir, 'partial'),
  };
}

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

// The three analysis prompts live on the backend. What stays here is the part
// that has to be local anyway: deciding what goes into each pass. The builders
// below assemble the variables the backend's prompt expects and nothing else —
// they no longer return a finished prompt string.

function buildSurveyPayload(scanResult, files) {
  const inventory = files
    .map(f => `${f.path} | ${f.language} | ${f.lines}`)
    .join('\n');

  const manifestBlocks = [];
  for (const file of files) {
    const base = path.posix.basename(file.path);
    const isReadme = /^readme(\.|$)/i.test(base);
    if (!isReadme && !MANIFEST_NAMES.has(base)) continue;

    let content = file.content;
    if (isReadme && content.length > README_MAX_CHARS) {
      content = content.slice(0, README_MAX_CHARS) + '\n[... README truncated ...]';
    }
    manifestBlocks.push(`### ${file.path}\n${content}`);
  }

  return {
    SOURCE_PATH: scanResult.sourcePath,
    TOTAL_FILES: scanResult.totalFiles,
    TOTAL_LINES: scanResult.totalLines,
    FILE_INVENTORY: inventory || '(no files)',
    MANIFEST_DATA: manifestBlocks.join('\n\n') || '(no manifest or README found)',
  };
}

function buildBatchPayload(scanResult, batch, index, total) {
  return {
    SOURCE_PATH: scanResult.sourcePath,
    BATCH_INDEX: index + 1,
    BATCH_COUNT: total,
    BATCH_FILE_COUNT: batch.length,
    BATCH_DATA: JSON.stringify(batch, null, 2),
  };
}

function buildDigest(merged, budgetChars = 12000) {
  const files = (merged.files || []).map(f =>
    `- ${f.path} (${f.language}, ${f.lines} lines, complexity=${f.complexity || 'unknown'}): ${f.purpose || 'no purpose recorded'}`
  );

  const techniques = (merged.techniques || []).map(t =>
    `- ${t.name} [${t.category}] — ${t.what_it_is || ''}`
  );

  const nodes = ((merged.chakra_network || {}).nodes || []).map(n =>
    `- ${n.id} (${n.type}) label="${n.label || n.id}"`
  );

  const edges = ((merged.chakra_network || {}).edges || []).map(e =>
    `- ${e.from} --${e.kind}--> ${e.to}`
  );

  const mutations = ((merged.impact_sight || {}).state_mutations || []).map(m =>
    `- ${m.file} :: ${m.symbol} (${m.kind})`
  );

  const deps = ((merged.impact_sight || {}).external_dependencies || []).map(d =>
    `- ${d.name} (${d.is_dev_only ? 'dev only' : 'runtime'}) in ${(d.used_in || []).slice(0, 5).join(', ')}`
  );

  const project = merged.project || {};
  const overview = merged.overview || {};

  const trimmable = [nodes, techniques, mutations, files];

  const render = () => [
    '## Project',
    `Name: ${project.name || 'unknown'}`,
    `Description: ${project.description || 'unknown'}`,
    `Primary language: ${project.primary_language || 'unknown'}`,
    project.framework ? `Framework: ${project.framework}` : null,
    `Architecture: ${overview.architecture_pattern || 'unknown'}`,
    `Summary: ${overview.summary || 'unknown'}`,
    '',
    '## Files (this is the complete file list)',
    files.join('\n') || '(none)',
    '',
    '## Techniques found in earlier passes',
    techniques.join('\n') || '(none)',
    '',
    '## Module graph nodes known so far',
    nodes.join('\n') || '(none)',
    '',
    '## Module graph edges found so far (within-batch only)',
    edges.join('\n') || '(none)',
    '',
    '## State mutations found in earlier passes',
    mutations.join('\n') || '(none)',
    '',
    '## External dependencies found in earlier passes',
    deps.join('\n') || '(none)',
  ].filter(l => l !== null).join('\n');

  let text = render();
  let guard = 0;
  while (text.length > budgetChars && guard < 200) {
    guard++;
    const target = trimmable.find(list => list.length > 4);
    if (!target) break;
    target.splice(0, Math.max(1, Math.floor(target.length * 0.3)));
    text = render();
  }

  if (text.length > budgetChars) {
    const dropped = [
      nodes.length ? `nodes (${nodes.length} kept)` : null,
      techniques.length ? `techniques (${techniques.length} kept)` : null,
      mutations.length ? `mutations (${mutations.length} kept)` : null,
      files.length ? `files (${files.length} kept of ${(merged.files || []).length})` : null,
    ].filter(Boolean).join(', ');
    text += `\n\n## Truncation notice\nPer-pass budget reached; earlier-pass detail was trimmed: ${dropped}. ` +
      `Cross-file edges and external dependencies are complete.`;
  }
  return text;
}

function buildSynthPayload(scanResult, merged) {
  return {
    SOURCE_PATH: scanResult.sourcePath,
    DIGEST: buildDigest(merged),
  };
}

function parseJSON(text, label) {
  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {

    const start = cleaned.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { /* fall through */ }
          }
        }
      }
    }
    throw new Error(`${label}: response was not valid JSON — ${err.message}`);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeBy(items, keyFn) {
  const seen = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (key == null || key === '') continue;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

const RISK_RANK = { low: 1, medium: 2, high: 3 };

function mergePasses(passes, synthesis) {
  const allFiles = [];
  const allTechniques = [];
  const allNodes = [];
  const allEdges = [];
  const allHotspots = [];
  const allMutations = [];
  const allDeps = [];

  for (const pass of passes) {
    if (!pass) continue;
    allFiles.push(...asArray(pass.files));
    allTechniques.push(...asArray(pass.techniques));

    const impact = pass.impact_sight || {};
    allHotspots.push(...asArray(impact.hotspots));
    allMutations.push(...asArray(impact.state_mutations));

    for (const dep of asArray(impact.external_dependencies)) {
      if (dep && dep.name) allDeps.push(dep);
    }

    const network = pass.chakra_network || {};
    allNodes.push(...asArray(network.nodes));
    allEdges.push(...asArray(network.edges));
  }

  const synthEdges = asArray(synthesis && synthesis.chakra_network && synthesis.chakra_network.edges);
  allEdges.push(...synthEdges);

  const synthHotspots = asArray(synthesis && synthesis.hotspots);
  const hotspotMap = new Map();

  const recordHotspot = (h, authoritative) => {
    if (!h || !h.file) return;
    const risk = h.risk;
    const existing = hotspotMap.get(h.file);

    if (!existing) {
      hotspotMap.set(h.file, { file: h.file, reason: h.reason || '', risk });
      return;
    }

    hotspotMap.set(h.file, {
      file: h.file,
      reason: (authoritative || !existing.reason) ? (h.reason || existing.reason) : existing.reason,
      risk: (RISK_RANK[risk] || 0) > (RISK_RANK[existing.risk] || 0) ? risk : existing.risk,
    });
  };

  for (const h of allHotspots) recordHotspot(h, false);
  for (const h of synthHotspots) recordHotspot(h, true);

  const nodeIds = new Set(allNodes.map(n => n && n.id).filter(Boolean));
  const edges = dedupeBy(
    allEdges.filter(e => e && e.from && e.to),
    e => `${e.from}|${e.to}|${e.kind}`
  ).filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

  const depMap = new Map();
  for (const dep of allDeps) {
    const existing = depMap.get(dep.name);
    if (!existing) {
      depMap.set(dep.name, { ...dep, used_in: [...new Set(asArray(dep.used_in))] });
    } else {
      existing.used_in = [...new Set([...existing.used_in, ...asArray(dep.used_in)])];
      existing.is_dev_only = existing.is_dev_only && dep.is_dev_only;
    }
  }

  const techMap = new Map();
  for (const t of allTechniques) {
    if (!t || !t.name) continue;
    const existing = techMap.get(t.name);
    if (!existing) {
      techMap.set(t.name, { ...t, occurrences: [...asArray(t.occurrences)] });
    } else {
      existing.occurrences = dedupeBy(
        [...existing.occurrences, ...asArray(t.occurrences)],
        o => `${o && o.file}|${o && o.line}|${o && o.snippet}`
      );
      for (const field of ['what_it_is', 'why_it_matters', 'without_it']) {
        if (!existing[field] && t[field]) existing[field] = t[field];
      }
    }
  }

  return {
    files: dedupeBy(allFiles.filter(f => f && f.path), f => f.path),
    techniques: [...techMap.values()],
    nodes: dedupeBy(allNodes.filter(n => n && n.id), n => n.id),
    edges,
    hotspots: [...hotspotMap.values()],
    state_mutations: dedupeBy(
      allMutations.filter(m => m && m.file && m.symbol),
      m => `${m.file}|${m.symbol}`
    ),
    external_dependencies: [...depMap.values()],
  };
}

function normalizeAnalysis(raw, scanResult) {
  const project = raw.project || {};
  const overview = raw.overview || {};
  const impact = raw.impact_sight || {};
  const quiz = raw.quiz || {};

  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  return {
    schema_version: SCHEMA_VERSION,
    analyzed_at: new Date().toISOString(),
    source_path: scanResult.sourcePath,

    project: {
      name: project.name || path.basename(scanResult.sourcePath),
      description: project.description || '',
      primary_language: project.primary_language || 'unknown',
      secondary_languages: asArray(project.secondary_languages),
      framework: project.framework || null,
      package_manager: project.package_manager || null,
    },

    overview: {
      summary: overview.summary || '',
      entry_points: asArray(overview.entry_points),
      architecture_pattern: overview.architecture_pattern || null,
      total_files: num(overview.total_files, scanResult.totalFiles),
      total_lines: num(overview.total_lines, scanResult.totalLines),
      has_tests: Boolean(overview.has_tests),
      test_coverage_estimate: overview.test_coverage_estimate || null,
    },

    chakra_network: {
      nodes: asArray(raw.chakra_network && raw.chakra_network.nodes),
      edges: asArray(raw.chakra_network && raw.chakra_network.edges),
    },

    techniques: asArray(raw.techniques).map(t => ({
      ...t,
      name: t.name || 'unnamed',
      category: t.category || 'language-feature',
      what_it_is: t.what_it_is || '',
      why_it_matters: t.why_it_matters || '',
      without_it: t.without_it || '',
      occurrences: asArray(t.occurrences),
      significance: t.significance || '',
    })),

    impact_sight: {
      hotspots: asArray(impact.hotspots),
      state_mutations: asArray(impact.state_mutations),
      external_dependencies: asArray(impact.external_dependencies),
    },

    files: asArray(raw.files).map(f => ({
      ...f,
      path: f.path,
      language: f.language || 'unknown',
      lines: num(f.lines, 0),
      purpose: f.purpose || '',
      exports: asArray(f.exports),
      imports: asArray(f.imports),
      complexity: ['low', 'medium', 'high'].includes(f.complexity) ? f.complexity : 'medium',
    })),

    quiz: {
      questions: asArray(quiz.questions).map(q => ({
        ...q,
        id: q.id || '',
        intent: q.intent || 'onboarding',
        level: num(q.level, 1),
        type: q.type === 'short_answer' ? 'short_answer' : 'multiple_choice',
        question: q.question || '',
        options: asArray(q.options),
        correct: q.correct || '',
        ideal_answer: q.ideal_answer || '',
        explanation: q.explanation || '',
        references: asArray(q.references),
      })),
    },
  };
}

function savePartial(paths, name, data) {
  fs.mkdirSync(paths.partial, { recursive: true });
  fs.writeFileSync(path.join(paths.partial, `${name}.json`), JSON.stringify(data, null, 2), 'utf8');
}

function loadPartial(paths, name) {
  const file = path.join(paths.partial, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function clearPartial(paths) {
  try {
    fs.rmSync(paths.partial, { recursive: true, force: true });
  } catch { /* best effort */ }
}

function buildChunks(analysis) {
  const chunks = [];
  const p = analysis.project;
  const o = analysis.overview;

  chunks.push({
    id: 'overview',
    text: [
      `Project: ${p.name}`,
      `Description: ${p.description}`,
      `Language: ${p.primary_language}`,
      p.framework ? `Framework: ${p.framework}` : null,
      p.package_manager ? `Package manager: ${p.package_manager}` : null,
      `Architecture: ${o.architecture_pattern || 'unknown'}`,
      `Summary: ${o.summary}`,
      `Total files: ${o.total_files}, Total lines: ${o.total_lines}`,
      `Has tests: ${o.has_tests}`,
      o.entry_points.length ? `Entry points: ${o.entry_points.join(', ')}` : null,
    ].filter(Boolean).join('\n'),
  });

  for (const f of analysis.files) {
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
        (f.imports || []).length ? `Imports: ${f.imports.map(i => i.source).join(', ')}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  for (const t of analysis.techniques) {
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

  for (const h of analysis.impact_sight.hotspots) {
    chunks.push({
      id: `hotspot:${h.file}`,
      text: `Hotspot file: ${h.file}\nReason: ${h.reason}\nRisk: ${h.risk}`,
    });
  }

  for (const d of analysis.impact_sight.external_dependencies) {
    chunks.push({
      id: `dep:${d.name}`,
      text: [
        `Dependency: ${d.name}`,
        `Type: ${d.is_dev_only ? 'dev only' : 'runtime'}`,
        (d.used_in || []).length ? `Used in: ${d.used_in.join(', ')}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  return chunks;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function buildAndSaveEmbeddings(analysis, paths) {
  const chunks = buildChunks(analysis);

  const groups = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    groups.push(chunks.slice(i, i + EMBED_BATCH_SIZE));
  }

  let embedded = 0;
  let failed = 0;

  // Progress and failures are routed through the shared status sink rather than
  // a spinner of their own. Two reasons: the embed phase already owns the live
  // line, so a second owner would fight it; and a failure used to be written
  // straight to stderr while a spinner was animating, so the next repaint
  // erased the warning.
  const vectorsByGroup = await mapWithConcurrency(
    groups,
    EMBED_CONCURRENCY,
    async (group) => {
      try {
        const vectors = await llm.embedBatch(group.map((c) => c.text));
        embedded += group.length;
        ui.status('embedded ' + embedded + '/' + chunks.length + ' chunks');
        return vectors;
      } catch (err) {
        ui.status('batch of ' + group.length + ' failed (' +
          ui.firstLine(err.message) + ') — continuing');
        failed += group.length;
        return null;
      }
    }
  );

  const result = [];
  vectorsByGroup.forEach((vectors, gi) => {
    if (!vectors) return;
    groups[gi].forEach((chunk, ci) => {
      result.push({ id: chunk.id, text: chunk.text, vector: vectors[ci] });
    });
  });

  if (result.length > 0) {
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.embeddings, JSON.stringify(result, null, 2), 'utf8');
  }

  return { embedded, failed, total: chunks.length };
}

async function analyze(targetPath, options = {}) {
  const resolved = path.resolve(targetPath);
  const paths = analysisPaths(resolved);

  ui.begin('analyze', ui.truncate(resolved, ui.termWidth() - 16));

  // ── scan ───────────────────────────────────────────────────────────────────
  ui.group('scan');
  validatePath(resolved);

  const scanResult = scanner.scan(resolved);
  const scanFacts = [
    ['files', scanResult.totalFiles.toLocaleString()],
    ['lines', scanResult.totalLines.toLocaleString()],
  ];
  if (scanResult.skipped.length) {
    scanFacts.push(['skipped', scanResult.skipped.length.toLocaleString()]);
  }
  ui.table(scanFacts, { labelWidth: 10 });

  if (scanResult.skipped.length) {
    ui.blank();
    // Only the first few, with a count for the rest: the full list can run to
    // hundreds of lines and drowns everything after it.
    ui.table(
      scanResult.skipped.slice(0, 5).map((s) => [s.path, s.reason]),
      { labelWidth: 44 }
    );
    if (scanResult.skipped.length > 5) {
      ui.note('and ' + (scanResult.skipped.length - 5) + ' more');
    }
  }

  if (scanResult.totalFiles === 0) {
    throw new Error('No analyzable files found — everything was ignored or skipped as binary.');
  }

  // ── plan ───────────────────────────────────────────────────────────────────
  const selection = batching.selectFiles(scanResult.files, {
    maxFiles: options.maxFiles,
    maxChars: options.maxChars,
  });
  const batches = batching.packBatches(selection.selected);
  const plan = batching.describePlan(selection, batches);

  ui.group('plan');
  ui.table([
    ['selected', plan.filesSelected + ' files → ' + plan.batchCount +
      ' batch' + (plan.batchCount === 1 ? '' : 'es')],
    ['input', '~' + plan.estimatedInputTokens.toLocaleString() + ' tokens'],
    ['llm calls', String(batches.length + 2)],
  ], { labelWidth: 10 });

  if (plan.filesDropped > 0) {
    ui.warn(ui.plural(plan.filesDropped, 'file') + ' dropped by budget', {
      indent: ui.FIELD,
      // The effective limits, not batching's constants: --max-files / --max-chars
      // override them, and quoting the default here reported "800 files" while
      // the run was in fact capped at 8.
      detail: ui.plural(plan.maxFiles, 'file') + ' / ' +
        Number(plan.maxChars).toLocaleString() + ' chars ceiling',
    });
  }

  // The bar's denominator is LLM calls, so its fraction means something.
  const totalCalls = batches.length + 2;
  ui.setTotal(totalCalls);
  ui.blank();

  // ── passes ─────────────────────────────────────────────────────────────────
  // Every phase below owns exactly one line that morphs from a live bar into a
  // permanent `✓ label  duration` when it settles. Nothing is transient-only, so
  // a watched run and a redirected run show the same permanent lines.
  let survey = loadPartial(paths, 'survey');
  if (survey) {
    const p = ui.createPhase('survey project shape');
    p.setCompleted(1);
    p.done('resumed');
  } else {
    const variables = buildSurveyPayload(scanResult, selection.selected);
    const p = ui.createPhase('survey project shape');
    const res = await llm.task('analyze_survey', variables);
    survey = parseJSON(res.text, 'survey pass');
    savePartial(paths, 'survey', survey);
    p.advance();
    p.done();
  }

  const batchPasses = [];
  for (let i = 0; i < batches.length; i++) {
    const label = 'files ' + (i + 1) + '/' + batches.length;
    const cacheKey = 'batch-' + i;

    let pass = loadPartial(paths, cacheKey);
    if (pass) {
      const p = ui.createPhase(label);
      p.setCompleted(totalCalls);
      p.done('resumed');
      batchPasses.push(pass);
      continue;
    }

    const variables = buildBatchPayload(scanResult, batches[i], i, batches.length);
    const p = ui.createPhase(label);
    const res = await llm.task('analyze_files', variables);
    pass = parseJSON(res.text, 'batch ' + (i + 1));
    p.advance();

    const expected = new Set(batches[i].map((f) => f.path));
    const returned = new Set(asArray(pass.files).map((f) => f && f.path));
    const missing = [...expected].filter((x) => !returned.has(x));
    if (missing.length > 0) {
      // Nested under the phase line so the problem reads as belonging to it.
      p.warn('model omitted ' + missing.length + ' of ' + expected.size + ' files', {
        detail: missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : ''),
      });
    } else {
      p.done();
    }

    savePartial(paths, cacheKey, pass);
    batchPasses.push(pass);
  }

  const merged = mergePasses(batchPasses, null);

  const partialAnalysis = {
    project: survey.project,
    overview: survey.overview,
    chakra_network: { nodes: merged.nodes, edges: merged.edges },
    techniques: merged.techniques,
    impact_sight: {
      hotspots: merged.hotspots,
      state_mutations: merged.state_mutations,
      external_dependencies: merged.external_dependencies,
    },
    files: merged.files,
  };

  // ── synthesis ──────────────────────────────────────────────────────────────
  let synthesis = loadPartial(paths, 'synthesis');
  if (synthesis) {
    const p = ui.createPhase('synthesis + quiz');
    p.setCompleted(totalCalls);
    p.done('resumed');
  } else {
    const variables = buildSynthPayload(scanResult, partialAnalysis);
    const p = ui.createPhase('synthesis + quiz');
    const res = await llm.task('analyze_synthesize', variables);
    synthesis = parseJSON(res.text, 'synthesis pass');
    savePartial(paths, 'synthesis', synthesis);
    p.advance();
    p.done();
  }

  const final = mergePasses(batchPasses, synthesis);
  const analysis = normalizeAnalysis({
    project: survey.project,
    overview: survey.overview,
    chakra_network: { nodes: final.nodes, edges: final.edges },
    techniques: final.techniques,
    impact_sight: {
      hotspots: final.hotspots,
      state_mutations: final.state_mutations,
      external_dependencies: final.external_dependencies,
    },
    files: final.files,
    quiz: synthesis.quiz,
  }, scanResult);

  if (analysis.overview.total_files !== scanResult.totalFiles) {
    analysis.overview.total_files = scanResult.totalFiles;
  }
  if (analysis.overview.total_lines !== scanResult.totalLines) {
    analysis.overview.total_lines = scanResult.totalLines;
  }

  // ── save + embed ───────────────────────────────────────────────────────────
  const savePhase = ui.createPhase('save analysis');
  fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(paths.analysis, JSON.stringify(analysis, null, 2), 'utf8');
  clearPartial(paths);
  savePhase.advance();
  savePhase.done();

  const embedPhase = ui.createPhase('embed for chat');
  let embedStats = null;
  try {
    embedStats = await buildAndSaveEmbeddings(analysis, paths);
    if (embedStats.failed > 0) {
      // This used to print straight to stderr while the spinner was animating,
      // so the next repaint erased it. The phase sink makes it durable.
      embedPhase.warn('embedded ' + embedStats.embedded + ' of ' + embedStats.total +
        ' chunks, ' + embedStats.failed + ' failed', {
        detail: 'chat will answer without retrieval until you re-run',
      });
    } else {
      embedPhase.advance();
      embedPhase.done(embedStats.embedded + ' chunks');
    }
  } catch (err) {
    embedPhase.warn('embedding step failed: ' + ui.firstLine(err.message), {
      detail: '`report` still works; `chat` needs a successful re-run',
    });
  }

  // ── done ───────────────────────────────────────────────────────────────────
  ui.summary([
    ['analyzed', ui.plural(analysis.files.length, 'file') + ', ' +
      ui.plural(analysis.techniques.length, 'technique')],
    ['risk', ui.plural(analysis.impact_sight.hotspots.length, 'hotspot') + ', ' +
      ui.plural(analysis.quiz.questions.length, 'quiz question')],
    // Every artifact lands in the same .byakugan/ directory, so naming the file
    // is enough — a relative walk up from cwd is longer and less useful.
    ['written', '.byakugan/' + path.basename(paths.analysis)],
  ].concat(embedStats
    ? [['written', '.byakugan/' + path.basename(paths.embeddings) + '   ' +
        ui.plural(embedStats.embedded, 'chunk')]]
    : []));

  // The trace is opt-in (`--trace`) and belongs with the rest of the readout, so
  // it renders here rather than in the CLI wrapper — otherwise it would print
  // after the `next` footer that closes the run.
  if (trace.isEnabled()) trace.render();

  ui.end({
    next: [
      ['byakugan report', 'open the HTML report'],
      ['byakugan chat', 'ask questions about this code'],
    ],
  });

  return analysis;
}

module.exports = {
  analyze,
  validatePath,
  parseJSON,
  mergePasses,
  normalizeAnalysis,
  buildChunks,
  buildSurveyPayload,
  buildBatchPayload,
  buildSynthPayload,
  buildDigest,
  analysisPaths,
  outputDirFor,
  TOP_K,
};