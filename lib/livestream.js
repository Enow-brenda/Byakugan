'use strict';

// Streams LLM output as *formatted* markdown, live.
//
// The naive approach — write raw chunks, then reprint the whole answer through
// the renderer — makes the user watch `**bold**` and `|pipes|` scroll past
// before seeing the real thing, and prints everything twice. Instead this keeps
// a permanently-written prefix and repaints only the trailing window, so bold
// text, lists and code blocks resolve while the model is still writing.
//
// The prefix is committed against the RAW text, never against rendered line
// indices. That distinction matters: partially-received markdown does not render
// to the same line count as the finished article (an unclosed table renders as
// nothing at all, a heading carries its own leading blank line), so committing
// "line 7" and then re-rendering can duplicate or drop whole lines. Committing a
// completed source block is stable, because a finished block renders the same
// regardless of what follows it.
//
// Repainting stays bounded so the cursor arithmetic can never exceed one screen
// height — a long answer scrolling past cannot corrupt the output. The bound is
// in screen rows rather than lines, because that is the unit the cursor-up that
// erases a frame actually moves in.

const { renderMarkdown } = require('./render');
const spinner = require('./spinner');
const ui = require('./ui');

const FRAME_MS = 55;   // repaint throttle

// Paced reveal. The model usually returns a burst of tokens in a few hundred ms,
// so without pacing the answer appears all at once and there is nothing to read
// along with; 40 chars/s is roughly a comfortable reading pace for a line of
// prose and keeps a 500-char answer to about 12s.
//
// This is only ever slower than the network, never faster, so it can delay a
// finished response but can never truncate one. Set BYAKUGAN_REVEAL_CPS=0 to
// turn it off, and note that --raw and non-TTY output bypass it entirely: a
// pipe should never be made to wait on a cosmetic delay.
const REVEAL_CPS = (() => {
  const raw = process.env.BYAKUGAN_REVEAL_CPS;
  if (raw === undefined || raw === '') return 40;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 40;
})();

// Was a byte-identical copy of spinner.canAnimate().
function canPaint() {
  return ui.canAnimate();
}

// Last position at or after `from` where a block has been terminated by a blank
// line. Returns -1 when no block is complete yet.
function blockBoundary(raw, from) {
  const re = /\n[ \t]*\n/g;
  re.lastIndex = from;
  let m;
  let last = -1;
  while ((m = re.exec(raw)) !== null) last = m.index + m[0].length;
  return last;
}

// Non-empty lines of the block starting at `from`.
function blockLines(raw, from) {
  return raw.slice(from).split('\n').map(l => l.trim()).filter(l => l !== '');
}

// True when the block currently being written is, or may become, a markdown
// table. Tables are buffered by the renderer until their block closes, so
// committing one mid-way renders it twice - once as the part already drawn and
// again as the rest. A header row whose `|---|` separator has not arrived yet is
// still a table being written, not a paragraph, so it is held back too.
function inTableBlock(raw, from) {
  const lines = blockLines(raw, from);
  if (!lines.length) return false;
  return lines[0].startsWith('|') || lines.every(l => l.startsWith('|'));
}

// The rows of the table that starts at `from`, up to the blank line that closes
// it. Anything after that blank line is a different block and is not part of it.
function tableBlockLines(raw, from) {
  const rows = [];
  for (const line of raw.slice(from).split('\n')) {
    const t = line.trim();
    if (t === '') break;
    rows.push(t);
  }
  return rows;
}

// A table is complete once the blank line that closes its block has arrived;
// only then can cli-table3 measure it and draw it in one piece.
function tableIsClosed(raw, at) {
  return raw.slice(at).split('\n').length > tableBlockLines(raw, at).length;
}

// The offset where an unfinished table begins, or -1 when there is none. An
// unfinished table is left out of the window entirely: painting it a row at a
// time re-measured and re-laid-out the columns on every line, which is what made
// them jitter.
function openTableStart(raw, from) {
  let at = from;
  for (let guard = 0; guard < 64; guard++) {
    if (at >= raw.length) return -1;
    if (inTableBlock(raw, at)) return tableIsClosed(raw, at) ? -1 : at;
    const next = blockBoundary(raw, at);
    if (next === -1) return -1;
    at = next;
  }
  return -1;
}

// The offset just past the first complete table at or after `from`, or -1. Used
// to commit a finished table immediately, so the fully laid-out grid is written
// once rather than repainted on every frame while it sits in the window.
function closedTableEnd(raw, from) {
  let at = from;
  for (let guard = 0; guard < 64; guard++) {
    if (at >= raw.length) return -1;
    if (inTableBlock(raw, at)) {
      if (!tableIsClosed(raw, at)) return -1;
      let idx = at;
      for (let i = 0; i < tableBlockLines(raw, at).length; i++) {
        idx = raw.indexOf('\n', idx) + 1;
      }
      const nl = raw.indexOf('\n', idx);
      return nl === -1 ? raw.length : nl + 1;
    }
    const next = blockBoundary(raw, at);
    if (next === -1) return -1;
    at = next;
  }
  return -1;
}

// The repaint window is budgeted in *screen rows*, not in lines. A rendered
// line longer than the terminal wraps onto several rows, and the cursor-up that
// clears the previous frame has to span every one of them; budgeting in lines
// under-counted, left the wrapped overflow on screen, and the next repaint drew
// the new text over it — the "text repeating several times" artefact.
//
// The budget is deliberately well under one screen height. The rewind is
// relative to the cursor, so scrolling the display is harmless as long as the
// previous frame is still above the cursor — which a sub-screen window
// guarantees. `TAIL_RESERVED` leaves room for the spinner/status line that
// renders beneath the answer.
const TAIL_RESERVED = 6;
const TAIL_MIN_ROWS = 3;
const TAIL_MAX_ROWS = 14;

function tailRowBudget() {
  return Math.max(TAIL_MIN_ROWS, Math.min(TAIL_MAX_ROWS, ui.termRows() - TAIL_RESERVED));
}

// Rows a set of rendered lines occupies once the terminal has wrapped them.
//
// The painter itself no longer needs this: it clears its repaint window with the
// terminal's own save/restore cursor, so it never has to know how tall the window
// was. Kept for callers that do need the wrapped height - and note that for
// anything produced by renderRows() the answer is simply lines.length, because
// hardWrap() has already made one line exactly one row.
function rowsFor(lines) {
  const cols = ui.termCols();
  let rows = 0;
  for (const line of lines) rows += Math.max(1, Math.ceil(ui.displayWidth(line) / cols));
  return rows;
}

// Wrap every rendered line to the terminal ourselves.
//
// A terminal wraps implicitly, and exactly where it wraps depends on the real
// column count, the padding the renderer emitted and how wide each glyph is.
// Estimating that and then rewinding by the estimate is what left stale frames
// on screen: the rewind came up short, the rows above it survived, and the next
// frame drew the same text again underneath. Writing the wrap points explicitly
// makes the rows on screen exactly the lines written, so the rewind is counted
// rather than guessed.
function hardWrap(text, cols) {
  const width = Math.max(1, cols - 1);
  const out = [];
  for (const line of text.split('\n')) {
    if (ui.displayWidth(line) <= width) { out.push(line); continue; }
    let rest = line;
    while (ui.displayWidth(rest) > width) {
      // Prefer a space to break on. A terminal wraps mid-word when a line
      // overflows, which is what split "LONGTOKEN" across two rows; breaking at
      // the last space keeps words whole. A single word longer than the terminal
      // still has to be cut, and then a character boundary is the only option.
      const head = rest.slice(0, width + 1);
      const brk = head.lastIndexOf(' ');
      if (brk > 0) {
        out.push(rest.slice(0, brk));
        rest = rest.slice(brk + 1);
      } else {
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
    }
    out.push(rest);
  }
  return out;
}

// Render markdown and return the exact screen rows it occupies, already wrapped
// so the terminal cannot wrap them a second time.
function renderRows(text) {
  return hardWrap(renderMarkdown(text), ui.termCols());
}

// Split point that leaves at most `maxLines` lines in the remainder, so a single
// enormous unterminated block still gets committed instead of growing forever.
function lineCapBoundary(tailSrc, maxLines) {
  if (inTableBlock(tailSrc, 0)) return -1;
  let idx = 0;
  let seen = 0;
  while (seen < maxLines) {
    const nl = tailSrc.indexOf('\n', idx);
    if (nl === -1) return -1;
    idx = nl + 1;
    seen++;
  }
  return idx;
}

// Advance the commit point far enough that the remaining tail fits the row
// budget, or return `from` when it already fits / cannot shrink further.
//
// Only ever cuts where the renderer is stable: a blank-line block boundary, a
// complete line, or — for a line too wide to fit at any budget — a whole number
// of screen rows of characters. Never discards rendered output: everything cut
// here becomes committed text, which is why a long answer scrolls off the screen
// instead of losing its head.
function trimBoundary(view, from, budget) {
  const rawTail = view.slice(from);
  const rows = renderRows(rawTail).length;
  if (rows <= budget) return from;

  // 1. A blank line is the safest possible cut.
  const block = blockBoundary(view, from + 1);
  if (block > from) return block;

  // 2. A complete line, so an unclosed construct is never split. Leaving
  //    `budget` lines bounds the remainder at `budget` rows, since every line
  //    occupies at least one.
  const lineCap = lineCapBoundary(rawTail, budget);
  if (lineCap > 0 && !fenceOpen(view.slice(from, from + lineCap))) return from + lineCap;

  // 3. A single line wider than the whole window — a long URL, a minified line,
  //    an over-wide table row. There is no newline to cut on, so cut a whole
  //    number of screen rows of characters and land flush on a row edge.
  //
  //    A table is never cut this way: the renderer buffers a table until its
  //    block closes, so a cut inside one leaves the rows already drawn on screen
  //    and then draws the whole table again underneath them.
  if (inTableBlock(view, from)) return from;
  const excessRows = rows - budget;
  const cutChars = excessRows * ui.termCols();
  if (cutChars > 0 && cutChars < rawTail.length) return from + cutChars;

  return from;
}

// An odd number of fences means the fragment ends inside a code block. The
// renderer closes it with a dangling border row, so the committed fragment gets
// its own fence to keep the box tidy.
function fenceOpen(text) {
  return (text.match(/^\s*```/gm) || []).length % 2 === 1;
}

class Painter {
  constructor(enabled, rawMode) {
    this.enabled = enabled;
    this.rawMode = Boolean(rawMode);
    this.raw = '';
    this.committed = 0;   // raw characters emitted for good
    this.tailRows = 0;    // screen rows the tail currently occupies
    // Whether the terminal still holds a saved cursor position for the repaint
    // window. The terminal's own save/restore is exact; the row count is only a
    // fallback for the frames before the first window is marked.
    this.anchored = false;
    // Rendered rows of an in-progress code block or table already written out.
    this.blockRows = 0;
    this.lastPaint = 0;

    // Reveal pacing. `shown` is how much of `raw` has been let through to the
    // screen; `raw` itself accumulates at full network speed, so nothing is lost
    // if the reveal is cut short.
    this.shown = 0;
    this.cps = REVEAL_CPS;
    // Seeded with one character so the very first chunk puts something on screen
    // immediately. Starting at zero credit meant the first allowance() saw ~0ms
    // elapsed, revealed nothing, and the painter had an empty view to draw for
    // the whole stream.
    this.credit = 1;
    this.lastTick = Date.now();
    this.timer = null;
    this.drained = null;
  }

  // How many characters may be shown by now.
  allowance() {
    if (!(this.cps > 0)) return Infinity;
    const now = Date.now();
    const elapsed = now - this.lastTick;
    this.lastTick = now;
    this.credit += (elapsed / 1000) * this.cps;
    const whole = Math.floor(this.credit);
    if (whole > 0) this.credit -= whole;
    return whole;
  }

  // Drives the reveal. Resolves once every received character has been shown, so
  // live() can await it before printing the trailing newline.
  startReveal() {
    if (!this.enabled) return Promise.resolve();
    if (this.cps <= 0) {
      this.shown = this.raw.length;
      this.paint(true);
      return Promise.resolve();
    }
    if (this.drained) return this.drained;

    this.drained = new Promise((resolve) => {
      const finish = () => {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.drained = null;
        resolve();
      };
      this.timer = setInterval(() => {
        const budget = this.allowance();
        if (budget > 0) {
          this.shown = Math.min(this.raw.length, this.shown + budget);
          this.paint(false);
        }
        if (this.shown >= this.raw.length) {
          // Final forced paint, so the last characters are definitely on screen
          // before the caller writes its trailing newline.
          this.paint(true);
          finish();
        }
      }, FRAME_MS);
      // Deliberately not unref'd. The reveal is part of the command's output, so
      // the process has to stay alive until the answer is fully shown; unref'ing
      // let Node exit after the first frame, truncating the answer.
    });
    return this.drained;
  }

  // Reveal whatever is left immediately. Used when the run ends so the answer is
  // never left half-shown.
  flush() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.drained = null;
    this.shown = this.raw.length;
  }

  visible() {
    return this.raw.slice(0, this.shown);
  }

  push(chunk) {
    this.raw += chunk;
    if (!this.enabled) return;
    // Consume the pacing budget on arrival too, not just from the drain timer.
    // Otherwise `shown` stayed at 0 for the whole stream and the painter had
    // nothing to draw until the run had already finished — the reveal needs to
    // track the model in real time, which is the whole point of it.
    if (this.cps > 0) {
      const budget = this.allowance();
      if (budget > 0) this.shown = Math.min(this.raw.length, this.shown + budget);
    } else {
      this.shown = this.raw.length;
    }
    this.paint(false);
  }

  paint(force) {
    if (!this.enabled) return;

    const now = Date.now();
    if (!force && now - this.lastPaint < FRAME_MS) return;
    this.lastPaint = now;

    // Everything below operates on the revealed prefix, not the received text,
    // so the pacing is what decides what is on screen.
    const view = this.visible();

    // A fenced code block renders as a box whose closing border row moves every
    // time a line arrives - so repainting it mid-flight is what duplicated and
    // dropped code lines. The rows above that border are stable, so the box is
    // written once and grows downward; the final frame rewrites it whole, which
    // is the only place the closing border is correct.
    //
    // Tables deliberately do NOT come this way. cli-table3 lays a table out from
    // the finished block, so a table is held back until it closes and then drawn
    // once, fully formed - see openTableStart() below.
    const tailSrc = view.slice(this.committed);
    if (fenceOpen(tailSrc)) {
      let text = tailSrc;
      if (fenceOpen(text)) text += '\n```';
      const rendered = renderRows(text);
      // renderMarkdown ends with a newline, so the last element is an empty
      // string. Trailing blanks have to go before the closing border is dropped,
      // or the border stays in the "stable" rows and a second one is drawn later.
      while (rendered.length && rendered[rendered.length - 1].trim() === '') rendered.pop();
      const body = rendered.slice(0, -1);
      // The block grows downward, so it is appended rather than repainted. The
      // only time it has to be cleared is on the way in and on the way out.
      if (this.blockRows === 0) {
        this.clearWindow();
        this.markAnchor();
      }
      const add = body.slice(this.blockRows);
      if (add.length > 0) {
        process.stdout.write((this.blockRows > 0 ? '\n' : '') + add.join('\n'));
        this.blockRows = body.length;
      }
      this.tailRows = body.length;
      return;
    }
    this.blockRows = 0;

    // How much can be committed. Block boundaries are always safe: a completed
    // block renders identically no matter what follows it. The cap path can land
    // inside an unclosed construct, so it is only used to stop the repaint
    // window growing without bound.
    const found = blockBoundary(view, this.committed);
    let boundary = found === -1 ? this.committed : found;

    // Trim the tail by *committing* it, never by discarding rendered lines. The
    // old line-based cap spliced the head off the display without committing it,
    // so a long block silently lost those lines; committing keeps every
    // character the model sent on screen.
    //
    // trimBoundary() returns a point that fits the budget in one step, so this
    // converges immediately; the loop is belt-and-braces for the case where a cut
    // lands somewhere that re-renders wider than expected.
    const budget = tailRowBudget();
    for (let guard = 0; guard < 8; guard++) {
      const next = trimBoundary(view, boundary, budget);
      if (next === boundary) break;
      boundary = next;
    }

    // Stop the window at any table that is still being written. Everything up to
    // that point streams as usual; the table itself appears in one go, laid out
    // by cli-table3, as soon as its block closes.
    const openTable = openTableStart(view, this.committed);
    const end = openTable === -1 ? view.length : openTable;
    if (boundary > end) boundary = end;

    // A finished table is committed the moment it closes. Left in the window it
    // would be repainted whole on every frame - correctly formatted, but the
    // same grid redrawn over and over while the rest of the answer types in.
    const tableEnd = closedTableEnd(view, this.committed);
    if (tableEnd > boundary) boundary = tableEnd;

    // Rewind the existing tail before drawing anything new.
    this.clearWindow();

    if (boundary > this.committed) {
      let block = view.slice(this.committed, boundary);
      if (fenceOpen(block)) block += '\n```';
      const text = renderRows(block).join('\n').replace(/\s+$/, '');
      if (text) process.stdout.write(text + '\n');
      this.committed = boundary;
    }

    // Anchor the repaint window at the cursor rather than counting rows back to
    // it. The terminal remembers exactly where the window started, so clearing it
    // is exact no matter how the lines wrapped - which is the whole difficulty,
    // since an estimate that is one row short leaves the previous frame on
    // screen and the answer appears again underneath it.
    this.markAnchor();
    const lines = renderRows(view.slice(this.committed, end));
    if (lines.length > 0) process.stdout.write(lines.join('\n'));
    this.tailRows = lines.length;
  }

  // Put the cursor back to the start of the repaint window and erase it.
  clearWindow() {
    if (!this.anchored) {
      // Nothing has been anchored yet: fall back to the row count.
      if (this.tailRows > 1) process.stdout.write(`\x1b[${this.tailRows - 1}A`);
      process.stdout.write('\r\x1b[J');
      return;
    }
    process.stdout.write('\x1b8');
    this.anchored = false;
    process.stdout.write('\r\x1b[J');
  }

  // Remember where the repaint window starts.
  markAnchor() {
    process.stdout.write('\x1b7');
    this.anchored = true;
  }

  // Erase the repaint window and write its contents out for good. The tail is
  // only a *window* while more text may still arrive; on the final frame it
  // becomes ordinary output, and re-rendering it as a fresh block is the only
  // way to get correct formatting for a construct that was still mid-flight —
  // an unclosed fence left in the window renders as a stray closing marker and
  // the lines it was carrying disappear from the finished screen.
  commitTail() {
    // Clear whatever the repaint window already wrote, then render the whole
    // tail once so the closing border lands in the right place.
    this.clearWindow();

    const rest = this.raw.slice(this.committed);
    if (rest.trim()) {
      let block = rest;
      if (fenceOpen(block)) block += '\n```';
      const text = renderRows(block).join('\n').replace(/\s+$/, '');
      if (text) process.stdout.write(text + '\n');
    }
    this.committed = this.raw.length;
    this.blockRows = 0;
    this.tailRows = 0;
  }

  finish() {
    if (this.rawMode) {
      if (this.raw) process.stdout.write(this.raw.replace(/\s+$/, '') + '\n');
      return;
    }
    if (!this.enabled) {
      // Non-interactive: one clean formatted block, no cursor tricks. Never paced
      // — a pipe is not a place to make the reader wait.
      const text = renderMarkdown(this.raw);
      if (text.trim()) process.stdout.write(text.replace(/\s+$/, '') + '\n');
      return;
    }
    this.flush();
    this.commitTail();
  }
}


async function live(options = {}) {
  const {
    run,            // (onChunk) => Promise<{ text }>
    label = 'Thinking',
    prefix = '',    // header line printed above the answer
    raw = false,    // --raw: stream unformatted and print verbatim
    signal,         // optional cancellation flag (chat's `closed`)
  } = options;

  const painter = new Painter(!raw && canPaint(), raw);
  let streaming = false;
  // While the answer is repainting, the painter owns the live line so a
  // rate-limit notice cannot print underneath the tail and corrupt it.
  let release = null;

  if (prefix) process.stdout.write(ui.strong(prefix) + '\n');

  // In raw mode the answer is written as it arrives, so a spinner would fight
  // the text for the same line.
  if (!raw) spinner.start(label);

  const onChunk = (chunk) => {
    if (signal && signal()) return;
    if (!streaming) {
      streaming = true;
      // The spinner owns the line only until real output arrives.
      if (!raw) spinner.stop();
      if (!raw && painter.enabled) {
        // A rate-limit or retry notice joins the revealed stream rather than
        // being printed separately, so the cursor bookkeeping stays consistent
        // and the notice is not overwritten by the next repaint.
        release = ui.claimSink({
          update(text) { painter.push('\n' + text + '\n'); },
          notice(text) { painter.push('\n' + text + '\n'); },
        });
      }
    }
    if (raw) {
      process.stdout.write(chunk);
    } else {
      painter.push(chunk);
    }
  };

  let result;
  try {
    result = await run(onChunk);
  } catch (err) {
    // Keep whatever arrived before the failure — partial output is still useful.
    // The reveal has to be flushed first: without it a paced painter has only
    // shown its first character or two, so "partial output preserved" would
    // preserve almost nothing.
    if (!streaming && !raw) spinner.stop();
    if (release) { release(); release = null; }
    if (painter.enabled || painter.rawMode) {
      painter.flush();
      painter.paint(true);
      process.stdout.write('\n');
    }
    throw err;
  }

  if (!streaming) {
    if (!raw) spinner.stop();
    // No chunks arrived; fall back to whatever the call returned.
    if (result && typeof result.text === 'string' && result.text) painter.raw = result.text;
  }

  if (!raw) {
    // The model is done, but the reveal may still be catching up. Let it finish
    // before the closing newline, so the answer is never cut off mid-sentence.
    await painter.startReveal();
    painter.finish();
  }
  if (release) { release(); release = null; }
  process.stdout.write('\n');

  return result;
}

module.exports = { live, Painter, canPaint, tailRowBudget, rowsFor };
