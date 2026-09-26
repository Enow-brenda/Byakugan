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

program
  .command('analyze <path>')
  .description('Analyze a codebase and save results to .byakugan/analysis.json')
  .action((targetPath) => {
    const analyzer = require('../lib/analyzer');
    try {
      analyzer.analyze(targetPath);
      console.log(chalk.green('✓ Analysis saved to .byakugan/analysis.json'));
    } catch (err) {
      console.error(chalk.red('✗ Analysis failed: ' + err.message));
      process.exit(1);
    }
  });

program.parse(process.argv);
