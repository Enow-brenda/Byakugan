'use strict';

// A deliberately tiny template renderer for the HTML report.
//
// The report is the only consumer, so this supports exactly what the report
// needs rather than becoming a general engine:
//
//   {{name}}      HTML-escaped interpolation
//   {{{name}}}    trusted, pre-rendered HTML (rows, markdown blocks, CSS)
//   {{a.b.c}}     dotted lookup
//   {{.}}         current item inside {{#each}} over primitives
//   {{@index}}    zero-based position inside {{#each}}
//   {{#each xs}}  repeat a block, with {{else}} when the list is empty
//   {{#if x}}     truthy test, with {{else}}
//   {{#unless x}} negated truthy test, with {{else}}
//   {{! ... }}    comment
//
// Escaping is on by default and unescaped output requires the triple-brace
// form, so adding a field to a template cannot accidentally introduce an XSS
// hole from model-generated text. Callers that need HTML pass it through
// {{{ }}} only after building it with esc().

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, c => ESCAPES[c]);
}

function lookup(data, path) {
  if (path === '.') return data && data.__isItem ? data.value : data;
  if (path === '@index') return data && data.__index;
  if (path === '@first') return data && data.__index === 0;
  if (path === '@last') {
    if (!data || !Array.isArray(data.__list)) return false;
    return data.__index === data.__list.length - 1;
  }
  let cur = data;
  for (const key of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function truthy(v) {
  if (v == null || v === false) return false;
  if (v === '' || v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

// Any {{ ... }} tag. Dispatch on the trimmed body below; the leading group is
// only for the triple-brace (trusted) form, which must win over the double form.
const TOKEN = /\{\{\{\s*([\w@.]+)\s*\}\}\}|\{\{([\s\S]*?)\}\}/g;

const isStructural = (inner) => /^[/#!]/.test(inner) || inner === 'else';

// Removes the indentation and trailing newline around a block tag that sits
// alone on its line, so indenting the template does not punch blank lines into
// the HTML. The tag itself is kept. This is a source pre-pass on purpose: doing
// it inside the tokenizer means tracking partial lines, and any mistake there
// eats real content. Only a line containing nothing but a structural tag counts.
const STANDALONE = /^[ \t]*((?:\{\{[#/!][\s\S]*?\}\}|\{\{\s*else\s*\}\}))[ \t]*\r?\n/gm;
function stripStandaloneLines(src) {
  return src.replace(STANDALONE, (all, tag) => tag);
}

// Parses a template into a node tree: text, out, raw, if, each.
function parse(source) {
  const root = { type: 'root', body: [], collect: 'body' };
  const stack = [root];
  let last = 0;
  let m;

  const push = (node) => {
    const top = stack[stack.length - 1];
    top[top.collect].push(node);
  };

  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(source)) !== null) {
    const before = source.slice(last, m.index);
    const inner = m[2] === undefined ? null : m[2].trim();

    if (before) push({ type: 'text', value: before });

    if (m[1] !== undefined) {
      push({ type: 'raw', path: m[1] });
    } else if (inner[0] === '!') {
      // comment: emit nothing
    } else if (inner[0] === '#') {
      const sp = inner.indexOf(' ');
      const name = sp === -1 ? inner.slice(1) : inner.slice(1, sp);
      const expr = sp === -1 ? '' : inner.slice(sp + 1).trim();
      if (name !== 'each' && name !== 'if' && name !== 'unless') {
        throw new Error('template: unsupported block {{#' + name + '}}');
      }
      const node = { type: name === 'unless' ? 'if' : name, expr, negate: name === 'unless', body: [], alt: [], collect: 'body' };
      push(node);
      stack.push(node);
    } else if (inner === 'else') {
      const top = stack[stack.length - 1];
      if (top.type !== 'each' && top.type !== 'if') throw new Error('template: {{else}} outside a block');
      top.collect = 'alt';
    } else if (inner[0] === '/') {
      const written = inner.slice(1).trim();
      const name = written === 'unless' ? 'if' : written;
      const node = stack.length > 1 ? stack.pop() : null;
      if (!node) throw new Error('template: unexpected {{/' + written + '}}');
      if (name !== node.type) {
        throw new Error('template: {{/' + written + '}} closes {{#' + node.type + '}}');
      }
    } else if (!/^[\w@.]+$/.test(inner)) {
      throw new Error('template: bad tag {{' + inner + '}}');
    } else {
      push({ type: 'out', path: inner });
    }

    last = m.index + m[0].length;
    TOKEN.lastIndex = last;
  }

  if (stack.length !== 1) throw new Error('template: unclosed block');
  if (last < source.length) push({ type: 'text', value: source.slice(last) });
  return root;
}

function renderNodes(nodes, data, out) {
  for (const node of nodes) {
    if (node.type === 'text') out.push(node.value);
    else if (node.type === 'out') out.push(escapeHtml(lookup(data, node.path)));
    else if (node.type === 'raw') out.push(String(lookup(data, node.path) ?? ''));
    else if (node.type === 'if') {
      const branch = truthy(lookup(data, node.expr)) !== Boolean(node.negate)
        ? node.body
        : node.alt;
      renderNodes(branch, data, out);
    } else if (node.type === 'each') {
      const list = lookup(data, node.expr);
      const arr = Array.isArray(list) ? list : [];
      if (arr.length === 0) {
        renderNodes(node.alt, data, out);
      } else {
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          // Scope inherits from the enclosing context so an inner loop can still
          // read outer values (e.g. a level flag) without being handed it again.
          const scope = Object.create(data && typeof data === 'object' ? data : null);
          if (item && typeof item === 'object') {
            Object.assign(scope, item);
          } else {
            scope.__isItem = true;
            scope.value = item;
          }
          scope.__index = i;
          scope.__list = arr;
          renderNodes(node.body, scope, out);
        }
      }
    }
  }
  return out;
}

const cache = new Map();

function parseCached(source) {
  if (cache.has(source)) return cache.get(source);
  const ast = parse(source);
  cache.set(source, ast);
  return ast;
}

function render(source, data) {
  if (typeof source !== 'string') throw new TypeError('template: source must be a string');
  const ast = parseCached(stripStandaloneLines(source));
  return renderNodes(ast.body, data || {}, []).join('');
}

module.exports = { render, escapeHtml, parse };
