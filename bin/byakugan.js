#!/usr/bin/env node
'use strict';

require('dotenv').config();
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
  .action(async () => {
    try {
      const { profile } = require('../lib/profiler');
      await profile();
    } catch (err) {
      console.error(chalk.red('✗ Profile setup failed: ' + err.message));
      process.exit(1);
    }
  });

// ── analyze ───────────────────────────────────────────────────────────────────
program
  .command('analyze <path>')
  .description('Scan a codebase and generate analysis.json via AI')
  .action(async (targetPath) => {
    try {
      const { analyze } = require('../lib/analyzer');
      await analyze(targetPath);
      console.log(chalk.green('✓ Analysis saved to .byakugan/analysis.json'));
    } catch (err) {
      console.error(chalk.red('✗ Analysis failed: ' + err.message));
      process.exit(1);
    }
  });

// ── report ────────────────────────────────────────────────────────────────────
program
  .command('report')
  .description('Generate an HTML report from analysis.json')
  .option('-o, --output <path>', 'Output file path (default: .byakugan/report.html)')
  .action((options) => {
    try {
      const { generateReport } = require('../lib/reporter');
      const outFile = generateReport(options.output);
      console.log(chalk.green('✓ Report saved to ' + outFile));
    } catch (err) {
      console.error(chalk.red('✗ Report generation failed: ' + err.message));
      process.exit(1);
    }
  });

// ── chat ──────────────────────────────────────────────────────────────────────
program
  .command('chat')
  .description('Ask questions about the analyzed codebase (reads analysis.json)')
  .action(async () => {
    try {
      const { chat } = require('../lib/chat');
      await chat();
    } catch (err) {
      console.error(chalk.red('✗ Chat failed: ' + err.message));
      process.exit(1);
    }
  });

program.parse(process.argv);
