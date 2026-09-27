'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ui = require('./ui');

// A profile describes the user, not the code, so it is scoped to wherever the
// user is standing. That also means `report` and `chat` read it from cwd —
// keep all three consistent.
// Profiling writes to the project directory (cwd unless --project is given);
// the resolved paths are computed per-call inside profile().

const INTENTS = ['onboarding', 'modification', 'migration', 'documentation'];
const LEVELS  = ['Junior', 'Mid', 'Senior', 'Lead', 'GodMode'];

// Choice lists are data, not pre-indented prompt text: the old prompts baked
// two literal spaces per option line, which is how the profiler ended up the one
// screen in the CLI that did not look like the rest of it.
const QUESTIONS = [
  {
    key: 'name',
    prompt: 'What is your name?',
    validate: v => v.trim().length > 0 || 'Name cannot be empty.',
    transform: v => v.trim(),
  },
  {
    key: 'intent',
    prompt: 'What is your goal with this codebase?',
    options: INTENTS,
    validate: v => {
      const n = parseInt(v, 10);
      return (n >= 1 && n <= INTENTS.length) ||
        `Enter a number between 1 and ${INTENTS.length}.`;
    },
    transform: v => INTENTS[parseInt(v, 10) - 1],
  },
  {
    key: 'level',
    prompt: 'What is your experience level?',
    options: LEVELS,
    validate: v => {
      const n = parseInt(v, 10);
      return (n >= 1 && n <= LEVELS.length) ||
        `Enter a number between 1 and ${LEVELS.length}.`;
    },
    transform: v => parseInt(v, 10),
  },
  {
    key: 'focus',
    prompt: 'Any specific area of the codebase you want to focus on?',
    optional: true,
    hint: 'press Enter to skip',
    validate: () => true,
    transform: v => v.trim() || null,
  },
  {
    key: 'notes',
    prompt: 'Anything else we should know about your task?',
    optional: true,
    hint: 'press Enter to skip',
    validate: () => true,
    transform: v => v.trim() || null,
  },
];

// One question, rendered through the shared UI vocabulary. `index` drives the
// quiet `n/5` counter so the user knows how much is left.
function renderQuestion(question, index, retry) {
  // begin() already ends with a blank line, so the first question must not add
  // a second one. A retry does need the break, or the `!` reason and the
  // repeated question run together on consecutive lines.
  if (index > 0 || retry) ui.blank();
  ui.prompt(question.prompt + ui.dim('   ' + (index + 1) + '/' + QUESTIONS.length));

  if (question.options) {
    question.options.forEach((label, i) => {
      process.stdout.write(
        ui.FIELD + '  ' + ui.dim(String(i + 1)) + '  ' + label + '\n'
      );
    });
    process.stdout.write(
      ui.FIELD + '  ' + ui.dim('enter 1-' + question.options.length) + '\n'
    );
  } else if (question.hint) {
    process.stdout.write(ui.FIELD + '  ' + ui.dim(question.hint) + '\n');
  }
}

// `scripted` holds pre-supplied answers when stdin is piped. Readline only
// listens while a question is outstanding, so with piped input every line can
// arrive before the first question and all of them would be dropped.
function ask(rl, question, scripted, interactive, index) {
  return new Promise((resolve, reject) => {
    let retried = false;
    const finish = answer => {
      const valid = question.validate(answer);
      if (valid !== true) {
        // Re-asking is a prompt interaction, not a program failure, so this
        // stays on stdout as a warn. It used to be a red ✗ on stdout, which put
        // error-looking output on the data stream.
        ui.warn(valid, { indent: ui.FIELD });
        retried = true;
        tryAsk();
      } else {
        resolve(question.transform(answer));
      }
    };

    const tryAsk = () => {
      renderQuestion(question, index, retried);

      if (scripted.length > 0) {
        const answer = scripted.shift();
        // A skipped optional answer is an empty line: writing it as-is left a
        // line of trailing spaces in the transcript.
        if (answer !== '') {
          process.stdout.write(ui.FIELD + '  ' + ui.accent(answer) + '\n');
        }
        return finish(answer);
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

      rl.question(ui.FIELD + '  ', finish);
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

  ui.begin('profile');

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
    for (let i = 0; i < QUESTIONS.length; i++) {
      answers[QUESTIONS[i].key] = await ask(rl, QUESTIONS[i], scripted, interactive, i);
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

  ui.blank();
  ui.success('profile saved', {
    detail: path.relative(dir, outputFile) || 'profile.json',
  });
  ui.end({
    next: [['byakugan analyze .', 'scan this codebase and build the report']],
  });
  return profileData;
}

module.exports = { profile };
