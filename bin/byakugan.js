#!/usr/bin/env node
'use strict';

// Order matters: dotenv applies the FIRST path that defines a key, so cwd is
// listed first to let a target repo override the packaged defaults.
require('dotenv').config({
  path: [
    require('path').join(process.cwd(), '.env'),
    require('path').join(__dirname, '..', '.env'),
  ],
});

const { program } = require('commander');
const pkg = require('../package.json');
const ui = require('../lib/ui');

// Every command funnels through here so a failure always reads the same way.
// This replaces seven hand-written `console.error(chalk.red('✗ X failed: ...'))`
// blocks that had drifted apart.
function command(name, run) {
  return async (...args) => {
    try {
      await run(...args);
    } catch (err) {
      ui.fail(name + ' failed', { detail: ui.firstLine(err && err.message ? err.message : err) });
      process.exit(1);
    }
  };
}

program
  .name('byakugan')
  .description(pkg.description)
  .version(pkg.version);

// ── profile ──────────────────────────────────────────────────────────────────
program
  .command('profile')
  .description('Set up your skill level and intent — saved to .byakugan/profile.json')
  .option('-p, --project <path>', 'Project directory (default: current directory)')
  .action(command('profile', async (options) => {
    const { profile } = require('../lib/profiler');
    await profile({ projectPath: options.project });
  }));

// ── analyze ───────────────────────────────────────────────────────────────────
program
  .command('analyze <path>')
  .description('Scan a codebase and generate analysis.json via AI')
  .option('--max-files <n>', 'Maximum files to analyze', parseInt)
  .option('--max-chars <n>', 'Maximum content characters to send', parseInt)
  .option('--trace', 'Print a per-call table of provider requests, tokens and timings')
  .action(command('analyze', async (targetPath, options) => {
    const { analyze } = require('../lib/analyzer');
    const trace = require('../lib/trace');
    // Opt-in only: tracing allocates a span per provider call and prints a
    // table, neither of which a normal run wants. analyze() renders the table
    // itself, before the `next` footer; the wrapper only owns the switch.
    if (options.trace) trace.enable();
    try {
      await analyze(targetPath, options);
    } finally {
      trace.disable();
    }
  }));

// ── report ────────────────────────────────────────────────────────────────────
program
  .command('report')
  .description('Generate an HTML report from analysis.json')
  .option('-o, --output <path>', 'Output file path (default: <project>/.byakugan/report.html)')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .option('--no-open', 'Write the report without opening it in a browser')
  .action(command('report', async (options) => {
    const { generateReport } = require('../lib/reporter');
    // reporter.js owns both the "saved" line and the browser hand-off, so the
    // library and the CLI always agree about what happened. Commander turns
    // --no-open into options.open === false; that is the only thing passed on.
    const outFile = await generateReport(options.output, options.project, { open: options.open });
    ui.end({
      next: options.open === false
        ? [['start ' + outFile, 'open it in your browser'], ['byakugan chat', 'ask questions about this code']]
        : [['byakugan chat', 'ask questions about this code']],
    });
  }));

// ── explain ──────────────────────────────────────────────────────────────────
program
  .command('explain <file>')
  .description('Explain what a specific file does, adapted to your profile level')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .option('--raw', 'Stream unformatted text instead of formatting as it arrives')
  .action(command('explain', async (file, options) => {
    const { explain } = require('../lib/explain');
    await explain(file, { projectPath: options.project, raw: options.raw });
  }));

// ── impact ────────────────────────────────────────────────────────────────────
program
  .command('impact <file>')
  .description('Analyse what would break if a specific file changed or was removed')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .option('--raw', 'Stream unformatted text instead of formatting as it arrives')
  .action(command('impact', async (file, options) => {
    const { impact } = require('../lib/impact');
    await impact(file, { projectPath: options.project, raw: options.raw });
  }));

// ── chat ──────────────────────────────────────────────────────────────────────
program
  .command('chat')
  .description('Ask questions about the analyzed codebase (reads analysis.json)')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .option('--rag', 'Force retrieval even if the analysis fits in context')
  .option('--no-rag', 'Force full-context mode, never retrieve')
  .option('--smart-route', 'Classify each question with an extra LLM call before retrieving')
  .action(command('chat', async (options) => {
    const { chat } = require('../lib/chat');
    await chat({
      projectPath: options.project,
      forceRag: options.rag === true,
      forceNoRag: options.rag === false,
      smartRoute: options.smartRoute === true,
    });
  }));

// ── doctor ────────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Check environment, API keys, provider reachability, and active limits')
  .action(async () => {
    const llm = require('../lib/llm');
    const batching = require('../lib/batching');

    ui.begin('doctor');

    ui.group('config');
    ui.table([
      ['node', process.version],
      ['generation model', llm.config.genModel()],
      ['embedding model', llm.config.embedModel()],
      ['groq endpoint', llm.config.groqBaseUrl],
      ['hf endpoint', llm.config.hfBaseUrl],
      ['timeout', (process.env.LLM_TIMEOUT_MS || '120000') + 'ms'],
      ['max attempts', process.env.LLM_MAX_ATTEMPTS || '4'],
      ['max files', String(batching.MAX_FILES)],
      ['max content chars', batching.MAX_CONTENT_CHARS.toLocaleString()],
      ['batch budget', batching.BATCH_CHAR_BUDGET.toLocaleString()],
    ], { labelWidth: 16 });

    const probePhase = ui.createPhase('probe providers');
    const probe = await llm.probe();
    // Settle before printing anything else. A live phase line is overwritten in
    // place with \r + erase, so any line written underneath it first would be
    // the one destroyed by the settle. The probe itself did complete; whether
    // the providers are usable is what the rows below report.
    probePhase.done();

    ui.group('providers');
    const results = [];
    for (const [label, result] of [['generation', probe.generation], ['embedding', probe.embedding]]) {
      if (result.ok) {
        const detail = result.dimensions
          ? result.dimensions + ' dimensions'
          : 'reply: "' + result.reply + '"';
        results.push([label, result.model, detail]);
      } else {
        results.push([label, null, result.error]);
      }
    }

    // A failed provider row and a failed summary used to both print, with the
    // row as red ✗ and the summary as a yellow '!'. One status per row, then a
    // single verdict.
    for (const [label, model, detail] of results) {
      if (model) {
        ui.success(label, { detail: model + '  ' + ui.dim(detail) });
      } else {
        ui.fail(label + ' unreachable', { detail: detail });
      }
    }

    const allOk = probe.generation.ok && probe.embedding.ok;
    if (!allOk) {
      ui.blank();
      ui.warn('fix the above before running `analyze`');
      process.exit(1);
    }
    ui.blank();
    ui.success('all checks passed', {
      detail: 'run `byakugan analyze <path>` to get started',
    });
  });

// An unknown command is a user error, not an internal one, so it gets the same
// failure treatment as everything else. Commander's own usage text (--help,
// bad flags) stays plain, which is correct for help output.
program.on('command:*', () => {
  ui.fail('unknown command: ' + program.args[0], {
    hint: 'run `byakugan --help` to see the available commands',
  });
  process.exit(1);
});

// Async action handlers must be awaited, otherwise a rejected promise from
// `analyze`/`chat` becomes an unhandled rejection instead of a clean exit.
program.parseAsync(process.argv).catch((err) => {
  ui.fail(ui.firstLine(err && err.message ? err.message : err));
  process.exit(1);
});
