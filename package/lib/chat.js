'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ui = require('./ui');
const llm = require('./llm');
const spinner = require('./spinner');
const { live } = require('./livestream');

const TOP_K = 3;
const MAX_HISTORY = 20;

const CONTEXT_CHAR_BUDGET = Number(process.env.CHAT_CONTEXT_BUDGET) || 100000;

function estimateTokens(text) {
  return Math.ceil((text || '').length / 3.5);
}

function condenseAnalysis(analysis, budgetChars) {
  const clone = JSON.parse(JSON.stringify(analysis));

  const measure = obj => JSON.stringify(clone).length;
  if (measure(clone) <= budgetChars) return { analysis: clone, condensed: false };

  for (const t of clone.techniques || []) {
    if (measure(clone) <= budgetChars) break;
    t.occurrences = (t.occurrences || []).slice(0, 1);
  }

  if (measure(clone) > budgetChars) {
    for (const f of clone.files || []) {
      if (measure(clone) <= budgetChars) break;
      f.signature = undefined;
      f.exports = (f.exports || []).map(e => ({ name: e.name, kind: e.kind }));
      f.imports = (f.imports || []).slice(0, 6);
    }
  }

  if (measure(clone) > budgetChars) {
    clone.quiz = { questions: [] };
  }

  return { analysis: clone, condensed: measure(clone) > budgetChars };
}

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function magnitude(v) {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== b.length) {

    throw new Error(
      `Embedding dimension mismatch: query has ${a.length}, index has ${b.length}. ` +
      `The index was built with a different EMBED_MODEL — re-run \`byakugan analyze\`.`
    );
  }
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dot(a, b) / (magA * magB);
}

function retrieve(embeddings, queryVector, k) {
  return embeddings
    .map(chunk => ({ chunk, score: cosine(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(r => r.chunk.text);
}

function analysisToContext(analysis) {
  const parts = [];

  const p = analysis.project;
  const o = analysis.overview;

  parts.push([
    '## PROJECT',
    `Name: ${p.name}`,
    `Description: ${p.description}`,
    `Language: ${p.primary_language}${p.secondary_languages && p.secondary_languages.length ? ' (+ ' + p.secondary_languages.join(', ') + ')' : ''}`,
    p.framework ? `Framework: ${p.framework}` : null,
    p.package_manager ? `Package manager: ${p.package_manager}` : null,
    `Architecture: ${o.architecture_pattern || 'unknown'}`,
    `Summary: ${o.summary}`,
    `Size: ${o.total_files} files, ${o.total_lines} lines`,
    `Tests: ${o.has_tests ? 'yes' : 'no'}${o.test_coverage_estimate ? ' (' + o.test_coverage_estimate + ')' : ''}`,
    o.entry_points && o.entry_points.length ? `Entry points: ${o.entry_points.join(', ')}` : null,
  ].filter(Boolean).join('\n'));

  if (analysis.files && analysis.files.length) {
    parts.push([
      '## FILES',
      ...analysis.files.map(f => {
        const ex = (f.exports || []).map(e => e.name).join(', ');
        return [
          `- ${f.path} [${f.language}, ${f.lines} lines, complexity=${f.complexity}]`,
          `  purpose: ${f.purpose}`,
          ex ? `  exports: ${ex}` : null,
          f.imports && f.imports.length ? `  imports: ${f.imports.map(i => i.source).join(', ')}` : null,
        ].filter(Boolean).join('\n');
      }),
    ].join('\n'));
  }

  if (analysis.techniques && analysis.techniques.length) {
    parts.push([
      '## TECHNIQUES',
      ...analysis.techniques.map(t => [
        `- ${t.name} [${t.category}${t.significance ? ', ' + t.significance + ' significance' : ''}]`,
        `  what: ${t.what_it_is}`,
        `  why: ${t.why_it_matters}`,
        t.without_it ? `  without: ${t.without_it}` : null,
        (t.occurrences || []).length ? `  seen in: ${t.occurrences.map(o2 => `${o2.file}:${o2.line}`).join(', ')}` : null,
      ].filter(Boolean).join('\n')),
    ].join('\n'));
  }

  const impact = analysis.impact_sight || {};
  if (impact.hotspots && impact.hotspots.length) {
    parts.push([
      '## HOTSPOTS',
      ...impact.hotspots.map(h => `- ${h.file} [${h.risk} risk]: ${h.reason}`),
    ].join('\n'));
  }
  if (impact.state_mutations && impact.state_mutations.length) {
    parts.push([
      '## STATE MUTATIONS',
      ...impact.state_mutations.map(m => `- ${m.file} :: ${m.symbol} (${m.kind})`),
    ].join('\n'));
  }
  if (impact.external_dependencies && impact.external_dependencies.length) {
    parts.push([
      '## EXTERNAL DEPENDENCIES',
      ...impact.external_dependencies.map(d =>
        `- ${d.name} (${d.is_dev_only ? 'dev only' : 'runtime'})${(d.used_in || []).length ? ' — used in ' + d.used_in.join(', ') : ''}`
      ),
    ].join('\n'));
  }

  const net = analysis.chakra_network || {};
  if (net.nodes && net.nodes.length) {
    const byId = new Map(net.nodes.map(n => [n.id, n]));
    parts.push([
      '## MODULE GRAPH',
      ...net.edges.slice(0, 200).map(e => {
        const from = (byId.get(e.from) || {}).label || e.from;
        const to = (byId.get(e.to) || {}).label || e.to;
        return `- ${from} --${e.kind}--> ${to}`;
      }),
    ].join('\n'));
  }

  return parts.join('\n\n');
}

// The chat system prompt — chat.md plus a reader-profile section keyed off the
// user's level and intent — is assembled on the backend, not here. Only prompt
// text moved; the facts it is assembled from (the project summary, the retrieved
// chunks, the level, the intent, the question) are still this module's job.

function decideMode(analysis, embeddings, options, contextChars) {
  if (options.forceNoRag) return { useRag: false, reason: 'forced off with --no-rag', oversized: false };
  if (options.forceRag) return { useRag: true, reason: 'forced on with --rag', oversized: false };

  const tokens = Math.ceil(contextChars / 3.5);

  if (!embeddings) {
    return {
      useRag: false,
      reason: 'no embeddings index — using full context',
      oversized: tokens > CONTEXT_CHAR_BUDGET / 3.5,
      tokens,
    };
  }

  if (contextChars <= CONTEXT_CHAR_BUDGET) {
    return {
      useRag: false,
      reason: `full context is ~${tokens.toLocaleString()} tokens and fits`,
      oversized: false,
      tokens,
    };
  }

  return {
    useRag: true,
    reason: `full context would be ~${tokens.toLocaleString()} tokens — retrieving top-${TOP_K}`,
    oversized: false,
    tokens,
  };
}

function readJSONFile(file, label, hint) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} not found at ${file}. ${hint}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${label}: ${err.message}`);
  }
}

async function chat(options = {}) {
  const dir = options.projectPath ? path.resolve(options.projectPath) : process.cwd();
  const byakuganDir = path.join(dir, '.byakugan');
  const analysisFile = path.join(byakuganDir, 'analysis.json');
  const embeddingsFile = path.join(byakuganDir, 'embeddings.json');
  const profileFile = path.join(byakuganDir, 'profile.json');

  if (!fs.existsSync(analysisFile)) {
    ui.warn('no analysis found for this directory');
    const targetPath = await new Promise((resolve) => {
      const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
      // Same wording as the identical reporter.js prompt, now through one helper.
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

  const analysis = readJSONFile(
    analysisFile, 'analysis.json',
    'Run `byakugan analyze <path>` first.'
  );

  let embeddings = null;
  if (fs.existsSync(embeddingsFile)) {
    try {
      embeddings = JSON.parse(fs.readFileSync(embeddingsFile, 'utf8'));
    } catch {
      ui.warn('embeddings.json is unreadable — falling back to full context');
    }
  }

  let profile = { name: null, intent: null, level: 3 };
  if (fs.existsSync(profileFile)) {
    try {
      profile = { ...profile, ...JSON.parse(fs.readFileSync(profileFile, 'utf8')) };
    } catch {
      ui.warn('profile.json is unreadable — using neutral defaults');
    }
  } else {
    ui.warn('no profile found — answers will not adapt to your level');
    const doProfile = await new Promise((resolve) => {
      const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
      ui.prompt('run profile setup now for adaptive answers? [Y/n]');
      tmp.question('', (ans) => {
        tmp.close();
        resolve(ans.trim().toLowerCase() !== 'n');
      });
    });
    if (doProfile) {
      const { profile: runProfile } = require('./profiler');
      await runProfile({ projectPath: options.projectPath });
      if (fs.existsSync(profileFile)) {
        try {
          profile = { ...profile, ...JSON.parse(fs.readFileSync(profileFile, 'utf8')) };
        } catch { /* neutral defaults remain */ }
      }
    } else {
      ui.note('continuing with neutral defaults');
    }
  }

  const projectName = analysis.project.name;
  const projectSummary = analysis.overview.summary;

  const { analysis: contextAnalysis } = condenseAnalysis(analysis, CONTEXT_CHAR_BUDGET);
  const fullContext = analysisToContext(contextAnalysis);

  const levelLabel = ['', 'Junior', 'Mid', 'Senior', 'Lead', 'GodMode'][profile.level] || 'unset';

  const mode = decideMode(analysis, embeddings, options, fullContext.length);

  ui.begin('chat', projectName);

  ui.group('session');
  if (profile.intent || profile.level) {
    ui.field('adapting for', (profile.name || 'you') + ' — ' +
      (profile.intent || 'no intent set') + ', ' + levelLabel + ' level');
  } else {
    ui.note('no profile found — run `byakugan profile` for adaptive answers');
  }
  ui.field('mode', (mode.useRag ? 'retrieval' : 'full context') +
    '  ' + ui.dim('(' + mode.reason + ')'));
  if (mode.oversized) {
    ui.blank();
    ui.warn('context is ~' + Math.ceil(fullContext.length / 3.5).toLocaleString() +
      ' tokens and will be truncated by the provider', {
      indent: ui.FIELD,
      detail: 're-run `byakugan analyze` to rebuild the embeddings index',
    });
  }
  ui.blank();
  ui.note('type a question and press Enter · "exit" or Ctrl+C to quit');
  ui.blank();

  const history = [];
  let closed = false;
  let busy = false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const shutdown = () => {
    if (closed) return;
    closed = true;
    ui.blank();
    ui.success('goodbye');
    rl.close();

    process.exit(0);
  };

  rl.on('SIGINT', shutdown);
  rl.on('close', () => { closed = true; });

  const askQuestion = () => {
    if (closed || busy) return;
    busy = true;
    ui.prompt('you');
    rl.question('  ', async (input) => {
      busy = false;
      if (closed) return;

      const userMessage = String(input || '').trim();

      if (!userMessage) { askQuestion(); return; }
      if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
        shutdown();
        return;
      }

      try {
        let context = '';

        if (mode.useRag) {

          if (options.smartRoute) {
            const route = await llm.routeQuery(userMessage);
            if (route === 'SEARCH') {
              const queryVector = await llm.embed(userMessage);
              context = retrieve(embeddings, queryVector, TOP_K).join('\n\n---\n\n');
            }
          } else {
            const queryVector = await llm.embed(userMessage);
            context = retrieve(embeddings, queryVector, TOP_K).join('\n\n---\n\n');
          }
        } else {

          context = fullContext;
        }

        // The backend assembles the system prompt from chat.md and the reader
        // profile, so this sends the ingredients rather than a finished message
        // list. The conversation history still passes through as-is, because the
        // turns are the user's own words.
        const variables = {
          projectName,
          projectSummary,
          context,
          intent: profile.intent,
          level: profile.level,
          question: userMessage,
        };

        if (closed) return;

        const { text: raw } = await live({
          // Was omitted, so chat/explain/impact all showed the same "Thinking".
          label: 'answering',
          signal: closed,
          run: (onChunk) => llm.streamTask('chat', variables, history, {}, onChunk),
        });

        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: raw });
        if (history.length > MAX_HISTORY) history.splice(0, 2);

      } catch (err) {
        // A failed turn must not kill the REPL, so this is a warn on the
        // conversation transcript rather than a process-level failure.
        if (!closed) ui.warn('error: ' + ui.firstLine(err.message), { indent: ui.PAD });
      }

      askQuestion();
    });
  };

  askQuestion();
}

module.exports = {
  chat,
  cosine,
  retrieve,
  condenseAnalysis,
  analysisToContext,
  decideMode,
  estimateTokens,
  TOP_K,
  CONTEXT_CHAR_BUDGET,
};