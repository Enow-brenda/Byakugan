'use strict';

const chalk = require('chalk');

const FRAME_MS = 80;
const UNICODE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const ASCII_FRAMES = ['|', '/', '-', '\\'];

// Animation is only meaningful on a real terminal that can render colour.
// Piped output, CI logs and NO_COLOR all fall back to one plain line per step.
function canAnimate() {
  return Boolean(process.stdout.isTTY) && chalk.level > 0 && !process.env.NO_COLOR;
}

// Braille looks best but renders as mojibake on legacy Windows consoles with an
// OEM codepage, so plain ASCII is used unless a modern terminal is detected.
// BYAKUGAN_SPINNER_FRAMES=ascii|unicode overrides the guess.
function pickFrames() {
  const forced = (process.env.BYAKUGAN_SPINNER_FRAMES || '').toLowerCase();
  if (forced === 'ascii') return ASCII_FRAMES;
  if (forced === 'unicode') return UNICODE_FRAMES;
  if (process.platform !== 'win32') return UNICODE_FRAMES;
  const modern = process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode' ||
    process.env.ConEmuANSI === 'ON' || process.env.TERMINUS_SUBLIME === '1';
  return modern ? UNICODE_FRAMES : ASCII_FRAMES;
}

const state = {
  timer: null,
  text: '',
  startedAt: 0,
  frame: 0,
  lastLine: '',
  animating: false,
};

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

function draw() {
  if (!state.animating) return;
  const frames = pickFrames();
  const frame = frames[state.frame % frames.length];
  const elapsed = formatDuration(Date.now() - state.startedAt);
  const line = `${chalk.cyan(frame)} ${state.text} ${chalk.gray('·')} ${chalk.gray(elapsed)}`;
  if (line === state.lastLine) return;
  state.lastLine = line;
  // Erase first: a previous longer line would otherwise leave trailing glyphs.
  process.stdout.write(`\r\x1b[2K${line}`);
}

function tick() {
  state.frame++;
  draw();
}

function start(text) {
  stop();
  state.text = text;
  state.startedAt = Date.now();
  state.frame = 0;
  state.lastLine = '';

  if (!canAnimate()) {
    // Non-interactive: emit the step once so logs still show what ran.
    process.stdout.write(`${text}\n`);
    return;
  }

  state.animating = true;
  draw();
  state.timer = setInterval(tick, FRAME_MS);
  // A forgotten stop() must never be able to hang the CLI.
  if (state.timer.unref) state.timer.unref();
}

function update(text) {
  if (typeof text !== 'string' || text === state.text) return;
  state.text = text;
  if (state.animating) draw();
}

function stop() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.animating) {
    process.stdout.write('\r\x1b[2K');
    state.animating = false;
    state.lastLine = '';
  }
  state.text = '';
}

// True only while a spinner is actually on screen. Distinct from canAnimate(),
// which just reports whether the terminal could show one.
function isActive() {
  return state.animating;
}

// One-off message from deep inside a long step (rate-limit waits, retries).
// Rendered in place when a spinner is running, otherwise written as a durable
// line — update() alone would silently drop the text whenever the terminal is
// capable of animating but no spinner is active, e.g. `doctor`.
function notice(text) {
  if (state.animating) {
    update(text);
    return;
  }
  process.stderr.write(`  ${text}\n`);
}

// Runs `fn` with a spinner active, guaranteeing the line is erased afterwards.
async function during(text, fn) {
  start(text);
  try {
    return await fn();
  } finally {
    stop();
  }
}

module.exports = {
  start,
  update,
  stop,
  during,
  notice,
  isActive,
  canAnimate,
};
