'use strict';

// Converts the Markdown that language models actually emit into HTML for the
// report, and does it safely.
//
// The report previously ran every AI-authored string through esc(), which is
// correct but shows the model its own syntax: a summary containing "**bold**"
// or a bullet list renders as literal asterisks and dashes. The fix is not to
// stop escaping, it is to escape first and then apply a deliberately small
// Markdown subset. Anything not recognised stays as escaped text, so this can
// only ever add formatting, never inject markup.
//
// Supported: paragraphs, # headings, **bold**, *italic*, `code`, fenced code
// blocks, - and * bullet lists, 1. numbered lists, > blockquotes, --- rules,
// [links](url) with a scheme allowlist, and hard line breaks.

const { escapeHtml } = require('./template');

// Only these schemes may appear in an href. A model that emits
// [click](javascript:...) must not become a live link.
const SAFE_SCHEME = /^(https?:|mailto:)/i;
const BARE_DOMAIN = /^(?:www\.)[^\s<>"]+\.[a-z]{2,}(?:\/[^\s<>"]*)?$/i;

function safeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  // Reject control characters used to smuggle a scheme past the check.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  if (SAFE_SCHEME.test(trimmed)) return trimmed;
  if (BARE_DOMAIN.test(trimmed)) return 'https://' + trimmed;
  return null;
}

// Inline formatting. Input must already be HTML-escaped.
function inline(escaped) {
  let out = escaped;

  // Code spans first: their contents must not be reinterpreted as bold/italic.
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (all, body) => {
    codes.push(body);
    return '\u0000CODE' + (codes.length - 1) + '\u0000';
  });

  // [label](url)
  out = out.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (all, label, url) => {
    const href = safeUrl(url);
    if (!href) return label;
    const external = /^https?:/i.test(href);
    return '<a href="' + escapeHtml(href) + '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : '') +
      '>' + label + '</a>';
  });

  // Bare domains become links, but only when not already inside an href.
  out = out.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()"]+)/g, (all, lead, url) => {
    if (/\bhref="/.test(out.slice(Math.max(0, out.indexOf(all) - 60), out.indexOf(all)))) return all;
    const href = safeUrl(url);
    if (!href) return all;
    return lead + '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(url) + '</a>';
  });

  out = out
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // CommonMark flanking rules: the delimiter must hug the text on both sides,
    // otherwise "2 * 3 * 4" and "a * b" would turn into italics.
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  out = out.replace(/\u0000CODE(\d+)\u0000/g, (all, i) => '<code>' + codes[Number(i)] + '</code>');
  return out;
}

function listItem(text) {
  return '<li>' + inline(text) + '</li>';
}

// Converts model-authored Markdown to HTML. Returns a string containing only
// markup this module generated around escaped text.
function mdToHtml(markdown) {
  if (markdown == null) return '';
  const text = String(markdown);
  if (!text.trim()) return '';

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (!buf.length) return;
    // Two trailing spaces is Markdown's hard line break. The break is carried
    // through as a NUL placeholder so it survives escaping and inline
    // formatting, then becomes a real <br> at the very end.
    const hard = buf.map((l, idx) => idx < buf.length - 1 && /\s{2,}$/.test(l));
    // Built from a char code so no raw control byte ends up in this source file.
    const BR = String.fromCharCode(0) + 'BR' + String.fromCharCode(0);
    let joined = '';
    buf.forEach((l, idx) => {
      if (idx > 0) joined += hard[idx - 1] ? BR : '\n';
      joined += escapeHtml(hard[idx] ? l.replace(/\s+$/, '') : l.trimEnd());
    });
    html.push('<p>' + inline(joined).split(BR).join('<br>') + '</p>');
  };

  let paragraph = [];

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = /^\s*(?:```|~~~)\s*([A-Za-z0-9+#._-]*)\s*$/.exec(line);
    if (fence) {
      flushParagraph(paragraph);
      paragraph = [];
      const marker = line.trim().slice(0, 3);
      const body = [];
      i++;
      while (i < lines.length && lines[i].trim().slice(0, 3) !== marker) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence (or end of input)
      const lang = fence[1] ? ' data-lang="' + escapeHtml(fence[1]) + '"' : '';
      html.push('<pre class="md-code"' + lang + '><code>' +
        escapeHtml(body.join('\n')) + '</code></pre>');
      continue;
    }

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(paragraph);
      paragraph = [];
      const level = heading[1].length;
      html.push('<h' + (level + 2) + '>' + inline(escapeHtml(heading[2].trim())) +
        '</h' + (level + 2) + '>');
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushParagraph(paragraph);
      paragraph = [];
      html.push('<hr>');
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(paragraph);
      paragraph = [];
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html.push('<blockquote>' + mdToHtml(body.join('\n')) + '</blockquote>');
      continue;
    }

    // lists
    const bullet = /^\s*[-*+]\s+(.*)$/;
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/;
    if (bullet.test(line) || ordered.test(line)) {
      flushParagraph(paragraph);
      paragraph = [];
      const isOrdered = ordered.test(line);
      const re = isOrdered ? ordered : bullet;
      const items = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (!m) {
          // A wrapped continuation line belongs to the previous item.
          if (items.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1] += '\n' + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        items.push(isOrdered ? m[2] : m[1]);
        i++;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      html.push('<' + tag + '>' + items.map(listItem).join('') + '</' + tag + '>');
      continue;
    }

    // blank line ends the paragraph
    if (!line.trim()) {
      flushParagraph(paragraph);
      paragraph = [];
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }

  flushParagraph(paragraph);
  return html.join('\n');
}

// Single-line variant for table cells and other places a block element is wrong.
function mdInline(markdown) {
  if (markdown == null) return '';
  const text = String(markdown).trim();
  if (!text) return '';
  const blocks = mdToHtml(text);
  if (!blocks) return '';
  // Collapse the block wrapper a single paragraph produced.
  const only = /^\s*<p>([\s\S]*)<\/p>\s*$/.exec(blocks);
  return only ? only[1] : blocks;
}

module.exports = { mdToHtml, mdInline, safeUrl };
