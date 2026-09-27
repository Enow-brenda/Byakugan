'use strict';

// Transient single-line activity indicator.
//
// This used to own its own TTY detection (a byte-identical copy of
// livestream.canPaint), re-read BYAKUGAN_SPINNER_FRAMES on every one of its
// 12 draws per second, and print notices to stderr while the rest of the CLI
// printed to stdout — so a redirected run interleaved two files with no way for
// a caller to pick a channel. All of that now lives in lib/ui.js: this module
// only owns the animation, and routes messages through the shared status sink.

const ui = require('./ui');

const GLYPH = ui.GLYPH;

const FRAME_MS = 80;
const UNICODE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const ASCII_FRAMES = ['|', '/', '-', '\\'];

// Braille looks best but renders as mojibake on legacy Windows consoles with an
// OEM codepage, so plain ASCII is used unless a modern terminal is detected.
// BYAKUGAN_SPINNER_FRAMES=ascii|unicode overrides the guess. Resolved once,
// rather than per draw.
function pickFrames() {
  const forced = (process.env.BYAKUGAN_SPINNER_FRAMES || '').toLowerCase();
  if (forced === 'ascii') return ASCII_FRAMES;
  if (forced === 'unicode') return UNICODE_FRAMES;
  if (process.platform !== 'win32') return UNICODE_FRAMES;
  const modern = process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode' ||
    process.env.ConEmuANSI === 'ON' || process.env.TERMINUS_SUBLIME === '1';
  return modern ? UNICODE_FRAMES : ASCII_FRAMES;
}

const FRAMES = pickFrames();

const state = {
  timer: null,
  text: '',
  startedAt: 0,
  frame: 0,
  lastLine: '',
  animating: false,
  release: null,
};

function formatDuration(ms) {
  return ui.formatDuration(ms);
}

function draw() {
  if (!state.animating) return;
  const frame = FRAMES[state.frame % FRAMES.length];
  // The frame is dim rather than cyan: cyan is the single accent reserved for
  // values, and a cyan spinner was indistinguishable from a step header.
  const line = ui.dim(frame) + ' ' + state.text + ' ' + ui.dim(GLYPH.sep() + ' ' + formatDuration(Date.now() - state.startedAt));
  if (line === state.lastLine) return;
  state.lastLine = line;
  // Erase first: a previous longer line would otherwise leave trailing glyphs.
  process.stdout.write('\r\x1b[2K' + line);
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

  if (!ui.canAnimate()) {
    // Non-interactive: emit the step once so logs still show what ran.
    process.stdout.write(ui.dim('  ' + text) + '\n');
    return;
  }
  state.animating = true;
  // Take the live line so a notice from deep inside this step is written here
  // rather than printed where the next repaint would erase it.
  state.release = ui.claimSink({
    update(next) {
      state.text = next;
      if (state.animating) draw();
    },
    notice(next) {
      state.text = next;
      if (state.animating) draw();
    },
  });
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
  if (state.release) {
    state.release();
    state.release = null;
  }
  state.text = '';
}

// True only while a spinner is actually on screen. Distinct from canAnimate(),
// which just reports whether the terminal could show one.
function isActive() {
  return state.animating;
}

// One-off message from deep inside a long step (rate-limit waits, retries).
// Routed through the shared sink so it lands on whichever line is live, or
// becomes a durable indented line when nothing is.
function notice(text) {
  ui.status(text);
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
  canAnimate: ui.canAnimate,
  formatDuration,
  frames: FRAMES,
};
