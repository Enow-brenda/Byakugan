#!/usr/bin/env node
'use strict';

// This package ships no .env and needs none. All configuration comes from the
// real environment, and the only variables that matter are BYAKUGAN_API_URL and
// BYAKUGAN_API_TOKEN. A project-local .env is read if one happens to be sitting
// in the current directory, purely as a convenience for people who keep their
// token there; its absence is not an error.
try {
  require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });
} catch {
  // dotenv is optional at runtime: everything can also come from the environment.
}

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

// The commands that need a model. Each one checks the backend before doing any
// real work, so a bad URL or a wrong token costs a second instead of surfacing
// three minutes into a scan — which is where a missing API key used to be
// discovered, after the directory walk had already finished.
const NEEDS_BACKEND = ['analyze', 'explain', 'impact', 'chat'];

function requireBackend() {
  return require('../lib/llm').ensureConnected();
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
    await requireBackend();
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
    await requireBackend();
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
    await requireBackend();
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
    await requireBackend();
    await chat({
      projectPath: options.project,
      forceRag: options.rag === true,
      forceNoRag: options.rag === false,
      smartRoute: options.smartRoute === true,
    });
  }));

// ── doctor ────────────────────────────────────────────────────────────────────
// There are no provider keys here to check any more. The providers belong to the
// backend, so `doctor` asks the backend two things: is it reachable, and are ITS
// providers working. A deep check spends a token and a request, so it is this
// command's whole reason for existing rather than something every run pays for.
program
  .command('doctor')
  .description('Check backend reachability, token, and the provider health behind it')
  .action(async () => {
    const llm = require('../lib/llm');
    const batching = require('../lib/batching');

    ui.begin('doctor');

    const probePhase = ui.createPhase('probing backend');

    const probe = await llm.probe({ deep: true });

    // Settle before printing anything else. A live phase line is overwritten in
    // place with \r + erase, so any line written underneath it first would be
    // the one destroyed by the settle. The probe itself did complete; whether
    // the backend is usable is what the rows below report.
    probePhase.done();

    if (!probe.reachable) {
      ui.group('backend');
      ui.fail('unreachable', { detail: probe.error });
      ui.blank();
      ui.warn('start the backend, or set BYAKUGAN_API_URL to the right host');
      process.exit(1);
    }

    if (probe.protocol !== llm.PROTOCOL) {
      ui.group('backend');
      ui.fail('protocol mismatch', {
        detail: `this CLI speaks v${llm.PROTOCOL}, the backend is v${probe.protocol} — update whichever is older`,
      });
      process.exit(1);
    }

    ui.group('config');
    ui.table([
      ['node', process.version],
      ['backend', llm.baseUrl()],
      ['protocol', 'v' + probe.protocol],
      ['mode', probe.mock ? 'mock (no real model calls)' : 'live'],
      ['token sent', process.env.BYAKUGAN_API_TOKEN ? 'yes' : (probe.authRequired ? 'no — required' : 'not required')],
      ['generation model', (probe.models && probe.models.gen) || 'unknown'],
      ['embedding model', (probe.models && probe.models.embed) || 'unknown'],
      ['max files', String(batching.MAX_FILES)],
      ['max content chars', batching.MAX_CONTENT_CHARS.toLocaleString()],
      // Says "serialized" because that is what the number now measures. Calling
      // it a raw char budget is what made the old value look far more generous
      // than the request it actually produced.
      ['batch budget', batching.BATCH_CHAR_BUDGET.toLocaleString() + ' serialized'],
    ], { labelWidth: 17 });

    // The rows below belong to the backend, not to this process. Labelling them
    // "providers" without saying whose they are is how a user ends up hunting
    // for a key that has not been in this package for a while.
    ui.group('backend providers');
    const results = [];
    for (const [label, result] of [['generation', probe.generation], ['embedding', probe.embedding]]) {
      if (result && result.ok) {
        const detail = result.dimensions
          ? result.dimensions + ' dimensions'
          : 'reply: "' + result.reply + '"';
        results.push([label, result.model, detail]);
      } else {
        results.push([label, null, (result && result.error) || 'no response']);
      }
    }

    // A failed provider row and a failed summary used to both print, with the
    // row as red ✗ and the summary as a yellow '!'. One status per row, then a
    // single verdict.
    for (const [label, model, detail] of results) {
      if (model) {
        ui.success(label, { detail: model + '  ' + ui.dim(detail) });
      } else {
        ui.fail(label + ' unavailable', { detail: detail });
      }
    }

    const allOk = probe.generation && probe.embedding && probe.generation.ok && probe.embedding.ok;
    if (!allOk) {
      ui.blank();
      ui.warn('the backend is up but its providers are not — check its logs and key config');
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
