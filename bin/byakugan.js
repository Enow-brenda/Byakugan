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
const chalk = require('chalk');
const pkg = require('../package.json');

program
  .name('byakugan')
  .description(pkg.description)
  .version(pkg.version);

// ── profile ──────────────────────────────────────────────────────────────────
program
  .command('profile')
  .description('Set up your skill level and intent — saved to .byakugan/profile.json')
  .option('-p, --project <path>', 'Project directory (default: current directory)')
  .action(async (options) => {
    try {
      const { profile } = require('../lib/profiler');
      await profile({ projectPath: options.project });
    } catch (err) {
      console.error(chalk.red('✗ Profile setup failed: ' + err.message));
      process.exit(1);
    }
  });

// ── analyze ───────────────────────────────────────────────────────────────────
program
  .command('analyze <path>')
  .description('Scan a codebase and generate analysis.json via AI')
  .option('--max-files <n>', 'Maximum files to analyze', parseInt)
  .option('--max-chars <n>', 'Maximum content characters to send', parseInt)
  .action(async (targetPath, options) => {
    try {
      const { analyze } = require('../lib/analyzer');
      await analyze(targetPath, options);
    } catch (err) {
      console.error(chalk.red('✗ Analysis failed: ' + err.message));
      process.exit(1);
    }
  });

// ── report ────────────────────────────────────────────────────────────────────
program
  .command('report')
  .description('Generate an HTML report from analysis.json')
  .option('-o, --output <path>', 'Output file path (default: <project>/.byakugan/report.html)')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .action(async (options) => {
    try {
      const { generateReport } = require('../lib/reporter');
      const outFile = await generateReport(options.output, options.project);
      console.log(chalk.green('✓ Report saved to ') + chalk.bold.green(outFile));
    } catch (err) {
      console.error(chalk.red('✗ Report generation failed: ' + err.message));
      process.exit(1);
    }
  });

// ── explain ──────────────────────────────────────────────────────────────────
program
  .command('explain <file>')
  .description('Explain what a specific file does, adapted to your profile level')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .action(async (file, options) => {
    try {
      const { explain } = require('../lib/explain');
      await explain(file, { projectPath: options.project });
    } catch (err) {
      console.error(chalk.red('✗ Explain failed: ' + err.message));
      process.exit(1);
    }
  });

// ── impact ────────────────────────────────────────────────────────────────────
program
  .command('impact <file>')
  .description('Analyse what would break if a specific file changed or was removed')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .action(async (file, options) => {
    try {
      const { impact } = require('../lib/impact');
      await impact(file, { projectPath: options.project });
    } catch (err) {
      console.error(chalk.red('✗ Impact analysis failed: ' + err.message));
      process.exit(1);
    }
  });

// ── chat ──────────────────────────────────────────────────────────────────────
program
  .command('chat')
  .description('Ask questions about the analyzed codebase (reads analysis.json)')
  .option('-p, --project <path>', 'Project directory to read (default: current directory)')
  .option('--rag', 'Force retrieval even if the analysis fits in context')
  .option('--no-rag', 'Force full-context mode, never retrieve')
  .option('--smart-route', 'Classify each question with an extra LLM call before retrieving')
  .action(async (options) => {
    try {
      const { chat } = require('../lib/chat');
      await chat({
        projectPath: options.project,
        forceRag: options.rag === true,
        forceNoRag: options.rag === false,
        smartRoute: options.smartRoute === true,
      });
    } catch (err) {
      console.error(chalk.red('✗ Chat failed: ' + err.message));
      process.exit(1);
    }
  });

// ── doctor ────────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Check environment, API keys, provider reachability, and active limits')
  .action(async () => {
    const llm = require('../lib/llm');
    const batching = require('../lib/batching');

    console.log(chalk.cyan('\n› Byakugan doctor\n'));

    const rows = [
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
    ];
    for (const [k, v] of rows) {
      console.log(`  ${chalk.gray(k.padEnd(20))} ${chalk.bold.green(v)}`);
    }

    console.log(chalk.cyan('\n› Probing providers...\n'));
    const probe = await llm.probe();

    for (const [label, result] of [['generation', probe.generation], ['embedding', probe.embedding]]) {
      if (result.ok) {
        const detail = result.dimensions ? `${result.dimensions} dimensions` : `reply: "${result.reply}"`;
        console.log(`  ${chalk.green('✓')} ${label.padEnd(12)} ${chalk.bold.green(result.model)} — ${detail}`);
      } else {
        console.log(`  ${chalk.red('✗')} ${label.padEnd(12)} ${chalk.red(result.error)}`);
      }
    }

    const allOk = probe.generation.ok && probe.embedding.ok;
    console.log(allOk
      ? chalk.green('\n✓ All checks passed.\n')
      : chalk.yellow('\n! Some checks failed — fix the above before running `analyze`.\n'));
    if (!allOk) process.exit(1);
  });

// Async action handlers must be awaited, otherwise a rejected promise from
// `analyze`/`chat` becomes an unhandled rejection instead of a clean exit.
program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('✗ ' + (err && err.message ? err.message : err)));
  process.exit(1);
});
