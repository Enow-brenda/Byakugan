'use strict';

const fs = require('fs');
const path = require('path');

const TRUNCATE_AT = 200;

const HARDCODED_IGNORES = [
  'node_modules', '.git', 'dist', 'build', '.byakugan',
  '*.lock', '*.log', '.env', '.env.*'
];

const LANGUAGE_MAP = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.jsx': 'JavaScript (JSX)',
  '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#',
  '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.c': 'C',
  '.html': 'HTML', '.htm': 'HTML',
  '.css': 'CSS', '.scss': 'SCSS', '.sass': 'SCSS',
  '.json': 'JSON', '.md': 'Markdown', '.markdown': 'Markdown',
  '.yaml': 'YAML', '.yml': 'YAML',
  '.sh': 'Shell', '.bash': 'Shell', '.sql': 'SQL',
};

function loadIgnoreRules(targetPath) {
  const rules = [...HARDCODED_IGNORES];
  const ignoreFile = path.join(targetPath, '.byakuganignore');
  if (fs.existsSync(ignoreFile)) {
    const lines = fs.readFileSync(ignoreFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) rules.push(trimmed);
    }
  }
  return rules;
}

function matchesPattern(name, pattern) {
  if (pattern.startsWith('*.')) {
    return name.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith('.*')) {
    const base = pattern.slice(0, -2);
    return name === base || name.startsWith(base + '.');
  }
  return name === pattern;
}

function shouldIgnore(relPath, rules) {
  const parts = relPath.split(path.sep);
  for (const part of parts) {
    for (const rule of rules) {
      if (matchesPattern(part, rule)) return true;
    }
  }
  return false;
}

function detectLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return LANGUAGE_MAP[ext] || 'Text';
}

function readFileEntry(absPath, relPath) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch {
    return null; // skip unreadable files (binary, permission denied)
  }
  const allLines = raw.split('\n');
  const totalLines = allLines.length;
  const truncated = totalLines > TRUNCATE_AT;
  const content = truncated
    ? allLines.slice(0, TRUNCATE_AT).join('\n') +
      `\n[truncated: ${totalLines - TRUNCATE_AT} lines not shown]`
    : raw;
  return {
    path: relPath,
    language: detectLanguage(path.basename(relPath)),
    lines: totalLines,
    content,
    truncated,
  };
}

function walkDir(dir, rootPath, rules, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // skip unreadable directories
  }
  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = path.relative(rootPath, absPath);
    if (shouldIgnore(relPath, rules)) continue;
    if (entry.isDirectory()) {
      walkDir(absPath, rootPath, rules, results);
    } else if (entry.isFile()) {
      const fileEntry = readFileEntry(absPath, relPath);
      if (fileEntry) results.push(fileEntry);
    }
  }
}

function scan(targetPath) {
  const rules = loadIgnoreRules(targetPath);
  const files = [];
  walkDir(targetPath, targetPath, rules, files);
  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  return {
    sourcePath: targetPath,
    totalFiles: files.length,
    totalLines,
    files,
  };
}

module.exports = { scan };
