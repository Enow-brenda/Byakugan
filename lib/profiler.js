'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');

const OUTPUT_DIR = path.join(process.cwd(), '.byakugan');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'profile.json');

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
    validate: () => true,
    transform: v => v.trim() || null,
  },
  {
    key: 'notes',
    prompt: 'Anything else we should know about your task? (press Enter to skip)',
    validate: () => true,
    transform: v => v.trim() || null,
  },
];

function ask(rl, question) {
  return new Promise(resolve => {
    const tryAsk = () => {
      rl.question(chalk.yellow('  ? ') + question.prompt + ' ', answer => {
        const valid = question.validate(answer);
        if (valid !== true) {
          console.log(chalk.red('  ✗ ' + valid));
          tryAsk();
        } else {
          resolve(question.transform(answer));
        }
      });
    };
    tryAsk();
  });
}

async function profile() {
  console.log(chalk.cyan('\n› Setting up your profile...\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answers = {};
  for (const q of QUESTIONS) {
    answers[q.key] = await ask(rl, q);
  }
  rl.close();

  const profileData = {
    ...answers,
    created_at: new Date().toISOString(),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(profileData, null, 2), 'utf8');

  console.log(chalk.green('\n✓ Profile saved to .byakugan/profile.json'));
  return profileData;
}

module.exports = { profile };
