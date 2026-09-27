'use strict';

const chalk = require('chalk');

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function renderInline(text) {
  return String(text)
    .replace(/`([^`\n]+)`/g, (_, c) => chalk.bgBlack.white(` ${c} `))
    .replace(/\*\*\*(.+?)\*\*\*/g, (_, t) => chalk.bold.yellowBright(t))
    .replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold.white(t))
    .replace(/__(.+?)__/g, (_, t) => chalk.bold.white(t))
    .replace(/\*([^*\n]+)\*/g, (_, t) => chalk.italic(t))
    .replace(/_([^_\n]+)_/g, (_, t) => chalk.italic(t))
    .replace(/~~(.+?)~~/g, (_, t) => chalk.strikethrough(t))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      chalk.cyan.underline(label) + chalk.gray(` (${url})`))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTableRow(line) {
  return line
    .split('|')
    .map(c => c.trim())
    .filter((_, i, a) => i > 0 && i < a.length - 1);
}

function isTableSeparator(row) {
  return row.every(c => /^[-:]+$/.test(c));
}

function renderTable(tableLines) {
  const rows = tableLines.map(parseTableRow);
  const dataRows = rows.filter(r => !isTableSeparator(r));
  if (dataRows.length === 0) return '';

  const colWidths = [];
  for (const row of dataRows) {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i] || 0, stripAnsi(cell).length);
    });
  }

  const hr = colWidths
    .map(w => chalk.gray('─'.repeat(w + 2)))
    .join(chalk.gray('┼'));

  const renderRow = (cells, isHeader) =>
    chalk.gray('│') +
    cells
      .map((cell, i) => {
        const w = colWidths[i] || 0;
        const rendered = isHeader ? chalk.bold.cyan(cell) : renderInline(cell);
        const pad = w - stripAnsi(cell).length;
        return ' ' + rendered + ' '.repeat(Math.max(0, pad)) + ' ' + chalk.gray('│');
      })
      .join('');

  const out = [];
  const topBorder =
    chalk.gray('┌') +
    colWidths.map(w => chalk.gray('─'.repeat(w + 2))).join(chalk.gray('┬')) +
    chalk.gray('┐');
  const bottomBorder =
    chalk.gray('└') +
    colWidths.map(w => chalk.gray('─'.repeat(w + 2))).join(chalk.gray('┴')) +
    chalk.gray('┘');

  out.push(topBorder);
  dataRows.forEach((row, ri) => {
    out.push(renderRow(row, ri === 0));
    if (ri === 0 && dataRows.length > 1) {
      out.push(chalk.gray('├') + hr + chalk.gray('┤'));
    }
  });
  out.push(bottomBorder);
  return out.join('\n');
}

function renderMarkdown(text) {
  const normalised = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalised.split('\n');
  const out = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';
  let tableBuffer = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    out.push('');
    out.push(renderTable(tableBuffer));
    out.push('');
    tableBuffer = [];
  };

  const flushCode = () => {
    if (codeLang) out.push(chalk.gray(`  ── ${codeLang} `));
    for (const cl of codeLines) {
      out.push(chalk.gray('  │ ') + chalk.white(cl));
    }
    out.push('');
    codeLines = [];
    codeLang = '';
    inCodeBlock = false;
  };

  for (const raw of lines) {
    const line = raw.replace(/<br\s*\/?>/gi, '\n');

    if (/^\s*```/.test(line)) {
      if (!inCodeBlock) {
        flushTable();
        inCodeBlock = true;
        codeLang = line.replace(/^\s*```/, '').trim();
        out.push('');
      } else {
        flushCode();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      tableBuffer.push(line);
      continue;
    }
    if (tableBuffer.length > 0) flushTable();

    if (line.includes('\n')) {
      for (const sub of line.split('\n')) {
        out.push(renderInline(sub));
      }
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === '' ) { out.push(''); continue; }

    if (/^---+$/.test(trimmed) || /^===+$/.test(trimmed)) {
      out.push(chalk.gray('  ' + '─'.repeat(64)));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = renderInline(headingMatch[2]);
      if (level === 1)      out.push('\n' + chalk.bold.whiteBright(title));
      else if (level === 2) out.push('\n' + chalk.bold.cyan(title));
      else if (level === 3) out.push(chalk.cyan(title));
      else                  out.push(chalk.gray(title));
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)/);
    if (bulletMatch) {
      const indent = line.match(/^(\s*)/)[1];
      out.push(indent + chalk.cyan('•') + ' ' + renderInline(bulletMatch[1]));
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      const indent = line.match(/^(\s*)/)[1];
      out.push(indent + chalk.cyan(orderedMatch[1] + '.') + ' ' + renderInline(orderedMatch[2]));
      continue;
    }

    if (/^>\s/.test(trimmed)) {
      out.push(chalk.gray('  ▎ ') + chalk.italic(renderInline(trimmed.slice(2))));
      continue;
    }

    out.push(renderInline(line));
  }

  if (inCodeBlock) flushCode();
  flushTable();

  return out.join('\n');
}

module.exports = { renderMarkdown, renderInline };
