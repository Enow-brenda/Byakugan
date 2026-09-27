'use strict';

// Terminal presentation for every Byakugan command.
//
// This file exists because the CLI used to print from 44 call sites across 6
// files with no shared vocabulary: four different spellings of a step header,
// two indent tiers for warnings, `chalk.bold.green` meaning five unrelated
// things, and blank lines embedded *inside* coloured strings so the SGR code
// spanned the newline and mangled the output of any colour-stripping consumer.
//
// The rules enforced here:
//
//   - Colour means status, never decoration. Green / yellow / red appear only
//     on the check / warn / fail glyphs. A single accent (cyan) marks the one
//     value that matters on a line. Everything else is dim or default.
//   - Bold means structure: group titles and the active phase, nothing else.
//   - Never wrap a newline in a colour code. paint() colours line by line.
//   - The glyph carries the severity; the sentence stays in the default colour
//     so long warnings remain readable.
//   - TTY and piped output carry the same information. Anything that animates
//     has a degraded form, and no permanent content is transient-only.

const chalk = require('chalk');
const Table = require('cli-table3');

// cli-table3's default frame is a full box, which is far too much chrome for a
// status readout. Blanking every border character keeps its column maths (and
// its string-width-based ANSI handling) while leaving plain aligned text.
const QUIET_CHARS = {
  top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
  bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
  left: '', 'left-mid': '', right: '', 'right-mid': '',
  mid: '', 'mid-mid': '', middle: '  ',
};
const QUIET_STYLE = {
  'padding-left': 0, 'padding-right': 0,
  head: [], border: [],
};

// ── capabilities ─────────────────────────────────────────────────────────────
// spinner.canAnimate() and livestream.canPaint() were byte-identical copies of
// this check. One definition now.
//
// Deliberately not cached: process.stdout.isTTY and chalk.level are cheap
// property reads, and caching them made the module untestable, since a harness
// (or a caller reconfiguring colour support) cannot flip a cached value.

function caps() {
  const tty = Boolean(process.stdout.isTTY);
  const color = tty && chalk.level > 0 && !process.env.NO_COLOR;
  return { tty, color, animate: color, paint: color };
}

function isTTY() {
  return caps().tty;
}

function canAnimate() {
  return caps().animate;
}

function termWidth() {
  const cols = process.stdout.columns;
  if (!cols || !Number.isFinite(cols)) return 80;
  // Very wide terminals make long lines hard to scan; very narrow ones cannot
  // hold a bar at all.
  return Math.max(36, Math.min(cols, 100));
}

// The *real* column count, unclamped. termWidth() is a readability cap for
// things we lay out ourselves; this is where the terminal actually wraps, so
// anything predicting how many screen rows a string will occupy must measure
// against this. Getting it wrong is what made the streaming repaint rewind too
// few rows and leave old frames on screen.
function termCols() {
  const cols = process.stdout.columns;
  if (!cols || !Number.isFinite(cols) || cols < 1) return 80;
  return Math.floor(cols);
}

// Real screen height, with a conservative default. Used to keep the streaming
// repaint window smaller than one screen so its relative cursor arithmetic holds
// even once the committed prefix scrolls the display.
function termRows() {
  const rows = process.stdout.rows;
  if (!rows || !Number.isFinite(rows) || rows < 1) return 24;
  return Math.floor(rows);
}

// Columns a single rendered line will occupy on screen. ANSI is stripped first
// (a colour code is zero-width) and an empty line still takes one row.
//
// Known limit: wide and combining glyphs are counted as one column each, so text
// containing them can still be undercounted.
function displayWidth(text) {
  const s = text == null ? '' : String(text);
  if (s === '') return 0;
  return plain(s).length;
}

// ── colour helpers ───────────────────────────────────────────────────────────

// Colours a possibly-multi-line string one line at a time so an SGR sequence can
// never span a line break.
function paint(fn, text) {
  const s = text == null ? '' : String(text);
  if (s.indexOf('\n') === -1) return fn(s);
  return s.split('\n').map(fn).join('\n');
}

const dim = (t) => paint(chalk.gray, t);
const accent = (t) => paint(chalk.cyan, t);
const strong = (t) => paint(chalk.bold, t);

// Strips SGR sequences. This backs every length calculation in the file
// (padEnd/padStart/truncate/firstLine), so it has to be a real strip: as a
// no-op it silently counted escape bytes as visible width and would cut a
// coloured value short by however many codes it carried.
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const plain = (t) => (t == null ? '' : String(t)).replace(ANSI_RE, '');

const GLYPH = {
  // '>' is used rather than the old '›' single guillemet: it pairs with the box
  // drawing the markdown renderer already emits and is unambiguous at small sizes.
  ok: () => paint(chalk.green, '✓'),
  warn: () => paint(chalk.yellow, '!'),
  err: () => paint(chalk.red, '✗'),
  active: () => paint(chalk.gray, '▸'),
  sep: () => paint(chalk.gray, '·'),
};

// ── geometry ─────────────────────────────────────────────────────────────────

const PAD = '  ';        // top-level line indent
const FIELD = '    ';    // content inside a group
const GAP =  2;          // spaces between a label column and its value

// Padding is always applied to plain text and coloured afterwards, so no
// stripAnsi pass is needed and the arithmetic cannot be thrown off by escapes.
function padEnd(text, width) {
  const s = plain(text);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function padStart(text, width) {
  const s = plain(text);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

function truncate(text, width) {
  const s = plain(text);
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, Math.max(0, width));
  return s.slice(0, width - 1) + '…';
}

function write(line) {
  process.stdout.write(line + '\n');
}

// ── status sink ──────────────────────────────────────────────────────────────
// Exactly one thing may own the transient line at a time: a spinner, or an
// in-flight phase bar. Deep code (llm.js rate-limit notices) needs to write
// into whichever one is live instead of blindly printing a second line, which
// is what previously caused warnings to be erased by the next repaint.

let sink = null;

// Registers a live line and returns a function that releases it.
function claimSink(target) {
  sink = target;
  return function release() {
    if (sink === target) sink = null;
  };
}

function activeSink() {
  return sink;
}

// Route a message to the live line if one owns it, otherwise emit a durable
// indented line. Callers no longer choose a stream.
function status(text) {
  if (sink && typeof sink.notice === 'function') {
    sink.notice(text);
    return;
  }
  if (sink && typeof sink.update === 'function') {
    sink.update(text);
    return;
  }
  write(FIELD + dim(text));
}

// ── run banner ───────────────────────────────────────────────────────────────

function begin(command, subject) {
  const head = command + (subject ? ' ' + subject : '');
  write('');
  write(PAD + dim(head));
  write('');
}

// ── groups and fields ────────────────────────────────────────────────────────

function group(title) {
  write('');
  write(PAD + strong(title));
}

function field(label, value, opts) {
  const o = opts || {};
  const width = o.width || 18;
  const rendered = o.accent === false ? plain(value) : accent(value);
  write(FIELD + dim(padEnd(label, width)) + ' '.repeat(GAP) + rendered);
}

// Label/value block. Column geometry and word wrapping are done by cli-table3
// (ANSI-aware via string-width), but drawn without a frame so it still reads as
// quiet text rather than a boxed grid — the full `┌─┬─┐` chrome was the main
// thing making these tables look heavy next to everything else.
//
// `labelWidth` caps the first column so one long key cannot push every value to
// the right edge; the value column then wraps under itself with a hanging
// indent instead of running off the screen.
function table(rows, opts) {
  const o = opts || {};
  const list = (rows || []).filter(Boolean);
  if (list.length === 0) return;

  const indent = o.indent || FIELD;
  // Never truncate a label to fit the cap: "max content cha…" is worse than a
  // column two characters wider. The cap only applies when the caller asks for a
  // fixed width, and a label longer than the terminal itself still gets cut
  // (there is nothing else to do at that point).
  const natural = list.reduce((m, r) => Math.max(m, plain(r[0]).length), 0);
  const room = Math.max(12, termWidth() - indent.length - GAP - 20);
  const labelWidth = Math.min(
    o.labelWidth && o.fixed ? o.labelWidth : Math.max(natural, 0),
    Math.max(room, 12)
  );

  // cli-table3 pads every cell out to colWidths, so passing the full remaining
  // width as the value width emitted ~80 columns of trailing spaces per row.
  // The widest value is measured instead, and only widened to fill the terminal
  // when a `fill` option asks for it.
  // Wrap against the space actually available, not against the widest value:
  // a single long value must not force every other row's column out to its
  // length, and a value longer than the terminal still has to wrap rather than
  // wrap-char mid-word.
  const avail = Math.max(20, termWidth() - indent.length - labelWidth - GAP);
  const valueWidth = Math.min(avail, o.valueWidth || avail);

  const t = new Table({
    colWidths: [labelWidth, valueWidth],
    wordWrap: true,
    chars: QUIET_CHARS,
    style: QUIET_STYLE,
  });

  // The value is the one thing on the row worth looking at, so it carries the
  // accent and the label recedes.
  const accentValue = o.accent !== false;
  for (const [label, value] of list) {
    t.push([
      dim(truncate(label, labelWidth)),
      accentValue ? accent(value) : plain(value),
    ]);
  }

  // cli-table3 emits its own lines; re-indent them so the block sits under its
  // group rather than hard against the left margin, and drop the right-hand
  // padding. Nothing sits to the right of the value column, so padding it out to
  // the widest value only adds trailing whitespace (and breaks naive
  // line-prefix matching in anything that parses this output).
  for (const line of t.toString().split('\n')) {
    const trimmed = line.replace(/\s+$/, '');
    if (trimmed) write(indent + trimmed);
  }
}

// Secondary prose under a group, dim so it never competes with a value.
function note(text) {
  write(FIELD + dim(text));
}

// Continuation row: a value that belongs to the row above it rather than
// carrying a label of its own (a second file under one "written" heading).
function tableRow(label, value, opts) {
  table([[label, value]], opts);
}

// Multi-column table with a dim header row, for data that has no natural
// label/value shape (the trace table, for instance). Columns are sized to their
// widest cell and share the leftover width evenly, so a long model name in one
// row cannot push the rest off the terminal. Headers wrap with their column.
function grid(headers, rows, opts) {
  const o = opts || {};
  const body = (rows || []).filter(Boolean);
  if (!headers || !headers.length || body.length === 0) return;

  const indent = o.indent || FIELD;
  const cols = headers.length;

  const widest = headers.map((h, i) => {
    const cells = body.map((r) => plain(r[i] === undefined ? '' : r[i]).length);
    return Math.max(plain(h).length, ...cells);
  });

  // The table cannot be wider than the terminal, so any column that wants more
  // than its fair share is trimmed — the widest first, which is the one that
  // actually caused the overflow.
  const budget = Math.max(20, termWidth() - indent.length);
  let widths = widest.slice();
  let over = widths.reduce((s, w) => s + w, 0) - budget;
  const order = widths
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.i);
  for (const i of order) {
    if (over <= 0) break;
    const min = headers[i].length <= 2 ? 1 : 6;
    const cut = Math.min(over, Math.max(0, widths[i] - min));
    widths[i] -= cut;
    over -= cut;
  }

  const t = new Table({
    colWidths: widths,
    wordWrap: true,
    chars: QUIET_CHARS,
    style: QUIET_STYLE,
  });

  if (o.head !== false) {
    t.push(headers.map((h) => dim(h)));
  }
  for (const r of body) {
    t.push(headers.map((h, i) => {
      const cell = r[i] === undefined ? '' : r[i];
      return i === (o.accentColumn === undefined ? cols - 1 : o.accentColumn)
        ? accent(cell)
        : plain(cell);
    }));
  }

  for (const line of t.toString().split('\n')) {
    const trimmed = line.replace(/\s+$/, '');
    if (trimmed) write(indent + trimmed);
  }
}

// ── status lines ─────────────────────────────────────────────────────────────

function success(text, opts) {
  const o = opts || {};
  const suffix = o.detail ? '   ' + dim(o.detail) : '';
  write(PAD + GLYPH.ok() + ' ' + (o.bold ? strong(text) : plain(text)) + suffix);
}

function warn(text, opts) {
  const o = opts || {};
  const indent = o.indent === undefined ? PAD : o.indent;
  write(indent + GLYPH.warn() + ' ' + plain(text));
  if (o.detail) write(indent + '  ' + dim(o.detail));
}

// Failures go to stderr so a piped stdout stays data-only.
function fail(text, opts) {
  const o = opts || {};
  const msg = plain(text);
  process.stderr.write(PAD + GLYPH.err() + ' ' + (o.bold ? strong(msg) : msg) + '\n');
  if (o.detail) process.stderr.write(PAD + '  ' + dim(o.detail) + '\n');
  if (o.hint) process.stderr.write(PAD + '  ' + dim(o.hint) + '\n');
}

// Single formatter for the seven duplicated `✗ <Command> failed: ...` sites.
function failWith(prefix, err) {
  const message = err && err.message ? err.message : String(err);
  fail(prefix + ' failed', { detail: firstLine(message) });
}

function firstLine(text) {
  return plain(text).split('\n')[0];
}

// "1 technique" / "2 techniques". Cheap to get wrong by hand, and the old
// output really did print "1 techniques".
function plural(count, singular, pluralForm) {
  const n = Number(count) || 0;
  return n + ' ' + (n === 1 ? singular : (pluralForm || singular + 's'));
}

// Input prompt marker. Was a yellow '?' used only by the profiler, which read as
// a typo everywhere else.
function prompt(text) {
  write(PAD + dim('?') + ' ' + plain(text));
}

function blank() {
  write('');
}

// ── phases ───────────────────────────────────────────────────────────────────
//
// A phase owns exactly one line. While it runs, that line shows a bar. When it
// finishes, the same line is morphed in place into `✓ label   duration`.
//
// This is what fixes the old behaviour where step headers vanished on a TTY
// (erased by the spinner) but reappeared as undecorated lines in a log: now
// every phase is a permanent line in both modes, and the set of permanent lines
// is identical whether the output was watched or read back.

const BAR_FULL = '█';
const BAR_EMPTY = '░';
const BAR_MAX = 24;

let total = 0;

function setTotal(n) {
  total = Number(n) || 0;
}

function renderBar(done, of) {
  if (of <= 0) return '';
  const available = termWidth() - PAD.length - 34;
  const width = Math.max(0, Math.min(BAR_MAX, available));
  if (width === 0) return '';
  const ratio = Math.max(0, Math.min(1, done / of));
  const filled = Math.round(ratio * width);
  return paint(chalk.cyan, BAR_FULL.repeat(filled)) +
    paint(chalk.gray, BAR_EMPTY.repeat(width - filled));
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return totalSeconds + 's';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
}

function createPhase(label, opts) {
  const o = opts || {};
  const startedAt = Date.now();
  let completed = 0;
  let settled = false;
  let active = false;
  let release = null;
  let noticeText = '';

  // Only the settled line is permanent, so a non-TTY run prints exactly one
  // line per phase. The transient `▸ label` opener used to be printed too,
  // which doubled every phase in a log and read as a step that never finished.
  const live = canAnimate();

  function line() {
    return PAD + GLYPH.active() + ' ' + strong(label);
  }

  function paintStart() {
    if (settled) return;
    if (!live) return;
    const bar = renderBar(completed, total);
    const fraction = dim(completed + '/' + total);
    // One dim() call for the whole tail. dim(sep() + ' ' + clock) nested a
    // grey SGR inside another grey SGR and left two spaces between `·` and the
    // time on screen.
    const clock = dim(GLYPH.sep() + ' ' + formatDuration(Date.now() - startedAt));
    const tail = noticeText ? '  ' + dim(noticeText) : '';
    process.stdout.write('\r\x1b[2K' + line() + '  ' + bar + '  ' + fraction + ' ' + clock + tail);
  }

  function settle(glyphFn, text, detail) {
    if (settled) return;
    settled = true;
    active = false;
    if (release) { release(); release = null; }
    const dur = formatDuration(Date.now() - startedAt);
    const body = PAD + glyphFn() + ' ' + text;
    const suffix = detail ? '   ' + dim(detail) : '';
    if (live) {
      // Overwrite the transient line with the permanent one.
      process.stdout.write('\r\x1b[2K' + body + suffix + '\n');
    } else {
      write(body + suffix);
    }
  }

  const handle = {
    label,

    // Bumps the completed count and repaints.
    advance(n) {
      if (settled) return handle;
      completed += (n == null ? 1 : n);
      paintStart();
      return handle;
    },

    setCompleted(n) {
      if (settled) return handle;
      completed = n;
      paintStart();
      return handle;
    },

    // Injected by llm.js for rate-limit / retry messages; shown on the phase
    // line instead of being printed where the next repaint would erase it.
    update(text) {
      if (settled) return handle;
      noticeText = plain(text);
      paintStart();
      return handle;
    },

    notice(text) {
      return handle.update(text);
    },

    done(detail) {
      settle(GLYPH.ok, strong(label), detail || formatDuration(Date.now() - startedAt));
      return handle;
    },

    fail(reason) {
      settle(GLYPH.err, label, reason);
      return handle;
    },

    // Finalises the phase line, then emits a warning nested under it, so a
    // mid-pass problem reads as belonging to that pass.
    warn(text, opts2) {
      handle.done();
      const wo = opts2 || {};
      write(FIELD + GLYPH.warn() + ' ' + plain(text));
      if (wo.detail) write(FIELD + '  ' + dim(wo.detail));
      return handle;
    },
  };

  release = claimSink(handle);
  paintStart();
  return handle;
}

// ── run footer ───────────────────────────────────────────────────────────────

// Suggests the natural next command. Replaces the dead-end `saved to <path>` line
// that used to be the last thing a run printed.
function end(options) {
  const o = options || {};
  const next = o.next || [];
  if (next.length === 0) return;
  write('');
  write(PAD + strong('next'));
  for (const [cmd, description] of next) {
    write(FIELD + accent(cmd) + '   ' + dim(description));
  }
}

function summary(rows) {
  group('done');
  table(rows, { labelWidth: 14 });
}

module.exports = {
  // capabilities
  caps, isTTY, canAnimate, termWidth, termCols, termRows, displayWidth,
  // colour + geometry
  paint, dim, accent, strong, plain, GLYPH, padEnd, padStart, truncate,
  PAD, FIELD, GAP,
  // text helpers
  firstLine, plural,
  // status sink
  claimSink, activeSink, status,
  // structure
  begin, end, group, field, table, grid, note, summary, blank,
  // status lines
  success, warn, fail, failWith, prompt,
  // phases
  setTotal, createPhase, formatDuration, total: () => total,
};
