'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');

// A profile describes the user, not the code, so it is scoped to wherever the
// user is standing. That also means `report` and `chat` read it from cwd —
// keep all three consistent.
// Profiling writes to the project directory (cwd unless --project is given);
// the resolved paths are computed per-call inside profile().

const INTENTS = ['onboarding', 'modification', 'migration', 'documentation'];
const LEVELS  = ['Junior', 'Mid', 'Senior', 'Lead', 'GodMode'];

const QUESTIONS = [
  {
    key: 'name',
    prompt: 'What is your name?',
    validate: v => v.trim().length > 0 || 'Name cannot be empty.',
    transform: v => v.trim(),
  },
  {
    key: 'intent',
    prompt: `What is your goal with this codebase?\n  ${INTENTS.map((t, i) => `${i + 1}. ${t}`).join('\n  ')}\nEnter 1-4:`,
    validate: v => {
      const n = parseInt(v, 10);
      return (n >= 1 && n <= 4) || 'Enter a number between 1 and 4.';
    },
    transform: v => INTENTS[parseInt(v, 10) - 1],
  },
  {
    key: 'level',
    prompt: `What is your experience level?\n  ${LEVELS.map((l, i) => `${i + 1}. ${l}`).join('\n  ')}\nEnter 1-5:`,
    validate: v => {
      const n = parseInt(v, 10);
      return (n >= 1 && n <= 5) || 'Enter a number between 1 and 5.';
    },
    transform: v => parseInt(v, 10),
  },
  {
    key: 'focus',
    prompt: 'Any specific area of the codebase you want to focus on? (press Enter to skip)',
    optional: true,
    validate: () => true,
    transform: v => v.trim() || null,
  },
  {
    key: 'notes',
    prompt: 'Anything else we should know about your task? (press Enter to skip)',
    optional: true,
    validate: () => true,
    transform: v => v.trim() || null,
  },
];

// `scripted` holds pre-supplied answers when stdin is piped. Readline only
// listens while a question is outstanding, so with piped input every line can
// arrive before the first question and all of them would be dropped.
function ask(rl, question, scripted, interactive) {
  return new Promise((resolve, reject) => {
    const finish = answer => {
      const valid = question.validate(answer);
      if (valid !== true) {
        console.log(chalk.red('  ✗ ' + valid));
        tryAsk();
      } else {
        resolve(question.transform(answer));
      }
    };

    const tryAsk = () => {
      if (scripted.length > 0) {
        console.log(chalk.yellow('  ? ') + question.prompt + ' ' + chalk.gray(scripted[0]));
        return finish(scripted.shift());
      }

      // Piped answers ran out. Falling through to rl.question() here would wait
      // on stdin that readScriptedAnswers() already drained to EOF, so the
      // callback would never fire and the whole profile would be discarded
      // without a word. Optional questions take their skip value; anything else
      // is a genuine gap in the input and has to be reported.
      if (!interactive) {
        if (question.optional) return resolve(question.transform(''));
        return reject(new Error(
          `piped input ended before "${question.key}" was answered — ` +
          `supply one answer per line for all ${QUESTIONS.length} questions`
        ));
      }

      rl.question(chalk.yellow('  ? ') + question.prompt + ' ', finish);
    };

    tryAsk();
  });
}

// Reads piped answers up front. Only attempted when stdin is not a TTY, since
// reading a terminal to EOF would hang.
function readScriptedAnswers() {
  if (process.stdin.isTTY) return [];
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

async function profile(options = {}) {
  // Defaults to cwd, but honours --project so the profile lands beside the
  // analysis/chat data it is meant to adapt.
  const dir = options.projectPath ? path.resolve(options.projectPath) : process.cwd();
  const outputDir = path.join(dir, '.byakugan');
  const outputFile = path.join(outputDir, 'profile.json');

  console.log(chalk.cyan('\n› Setting up your profile...\n'));

  const scripted = readScriptedAnswers();
  // Piped input means every answer must come from the script: once stdin is
  // drained there is no terminal left to prompt on.
  const interactive = Boolean(process.stdin.isTTY);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answers = {};
  try {
    for (const q of QUESTIONS) {
      answers[q.key] = await ask(rl, q, scripted, interactive);
    }
  } finally {
    rl.close();
  }

  const profileData = {
    ...answers,
    created_at: new Date().toISOString(),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(profileData, null, 2), 'utf8');

  console.log(chalk.green('\n✓ Profile saved to ') +
    chalk.bold.green(path.relative(dir, outputFile) || 'profile.json'));
  return profileData;
}

module.exports = { profile };
