'use strict';

const fs = require('fs');
const path = require('path');

const HEAD_LINES  = 60;
const TAIL_LINES  = 40;
const INLINE_LINES = HEAD_LINES + TAIL_LINES;

const MAX_FILE_BYTES = 512 * 1024;

const SNIFF_BYTES = 4096;

const HARDCODED_IGNORES = [
  'node_modules', '.git', 'dist', 'build', '.byakugan',
  'vendor', 'coverage', '__pycache__', 'target', 'venv', '.next', '.nuxt', '.cache',
  '*.lock', '*.log', '*.min.js', '*.min.css', '*.map', '*.snap',
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico', '*.webp', '*.bmp', '*.tiff',
  '*.pdf', '*.zip', '*.tar', '*.gz', '*.tgz', '*.bz2', '*.7z', '*.rar',
  '*.woff', '*.woff2', '*.ttf', '*.eot', '*.otf',
  '*.mp3', '*.mp4', '*.wav', '*.avi', '*.mov', '*.webm', '*.ogg',
  '*.exe', '*.dll', '*.so', '*.dylib', '*.class', '*.jar', '*.wasm', '*.bin',
  '*.pyc', '*.pyo', '*.db', '*.sqlite', '*.sqlite3',
  '.env', '.env.*',
];

const DOTFILE_ALLOWLIST = new Set(['.byakuganignore']);

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
  '.vue': 'Vue', '.svelte': 'Svelte', '.kt': 'Kotlin', '.swift': 'Swift',
  '.scala': 'Scala', '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir',
  '.hs': 'Haskell', '.clj': 'Clojure', '.lua': 'Lua', '.pl': 'Perl',
  '.r': 'R', '.jl': 'Julia', '.zig': 'Zig', '.m': 'Objective-C',
  '.graphql': 'GraphQL', '.proto': 'Protobuf', '.tf': 'Terraform',
};

const EXTENSIONLESS_SOURCE = new Set([
  'Makefile', 'Dockerfile', 'Rakefile', 'Gemfile', 'Procfile',
  'LICENSE', 'README', 'CHANGELOG', 'CODEOWNERS',
]);

function normalizeRule(rule) {
  let r = rule.trim();
  let negate = false;
  if (r.startsWith('!')) {
    negate = true;
    r = r.slice(1).trim();
  }
  const dirOnly = r.endsWith('/');
  if (dirOnly) r = r.slice(0, -1);
  const anchored = r.startsWith('/');
  if (anchored) r = r.slice(1);
  return { raw: rule, negate, dirOnly, anchored, pattern: r };
}

function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
      if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') {

          i++;
          out += '(?:.*/)?';
        } else if (i + 1 >= pattern.length) {

          out += '.*';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + out + '$');
}

function ruleMatches(rule, relPath, isDir) {
  if (rule.dirOnly && !isDir) return false;

  const normalized = relPath.split(path.sep).join('/');

  if (rule.pattern.includes('/')) {

    const anchoredRe = globToRegExp(rule.pattern);
    if (rule.anchored) return anchoredRe.test(normalized);

    const looseRe = globToRegExp('**/' + rule.pattern);
    return anchoredRe.test(normalized) || looseRe.test(normalized);
  }

  const nameRe = globToRegExp(rule.pattern);
  return normalized.split('/').some(segment => nameRe.test(segment));
}

function loadIgnoreRules(targetPath) {
  const rules = HARDCODED_IGNORES.map(normalizeRule);

  const ignoreFile = path.join(targetPath, '.byakuganignore');
  if (fs.existsSync(ignoreFile)) {
    let lines;
    try {
      lines = fs.readFileSync(ignoreFile, 'utf8').split(/\r?\n/);
    } catch {
      lines = [];
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      rules.push(normalizeRule(trimmed));
    }
  }

  return rules;
}

function shouldIgnore(relPath, isDir, rules) {
  const segments = relPath.split(path.sep).filter(Boolean);

  if (segments.some((seg, i) =>
        seg.startsWith('.') &&
        seg !== '.' && seg !== '..' &&
        !(i === segments.length - 1 && DOTFILE_ALLOWLIST.has(seg)))) {
    return true;
  }

  let ignored = false;
  for (const rule of rules) {
    if (ruleMatches(rule, relPath, isDir)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

function detectLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];
  if (!ext && EXTENSIONLESS_SOURCE.has(filename)) return 'Text';
  return 'Text';
}

function isProbablyBinary(absPath) {
  let handle;
  try {
    handle = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(SNIFF_BYTES);
    const bytesRead = fs.readSync(handle, buf, 0, SNIFF_BYTES, 0);
    const slice = buf.subarray(0, bytesRead);

    if (slice.includes(0)) return true;

    let suspicious = 0;
    for (const byte of slice) {
      if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) suspicious++;
    }
    return bytesRead > 0 && suspicious / bytesRead > 0.3;
  } catch {
    return true;
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* best effort */ }
    }
  }
}

function assembleContent(allLines, totalLines) {
  if (totalLines <= INLINE_LINES) {
    return { content: allLines.join('\n'), truncated: false, mode: 'full' };
  }

  const head = allLines.slice(0, HEAD_LINES);
  const tail = allLines.slice(-TAIL_LINES);
  const omitted = totalLines - INLINE_LINES;

  const content =
    head.join('\n') +
    `\n\n[... ${omitted} lines omitted from the middle ...]\n\n` +
    tail.join('\n');

  return { content, truncated: true, mode: 'head-tail' };
}

const HIGH_VALUE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java',
  '.rb', '.php', '.cs', '.c', '.cpp', '.cc', '.swift', '.kt', '.scala', '.vue',
  '.svelte', '.dart', '.ex', '.exs', '.hs', '.lua', '.zig',
]);

const ENTRY_HINTS = /(^|[\\/])(bin|src|app|lib|cmd|main|index|server|cli|entry|entrypoint)[\\/]/i;
const ENTRY_FILENAMES = /^(index|main|app|server|cli|main|__main__)\.[a-z]+$/i;

function valueRank(file) {
  const ext = path.extname(file.path).toLowerCase();
  let score = 0;

  if (HIGH_VALUE_EXT.has(ext)) score += 50;
  if (ENTRY_HINTS.test(file.path)) score += 30;
  if (ENTRY_FILENAMES.test(path.basename(file.path))) score += 40;
  if (['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml',
       'build.gradle', 'composer.json', 'Gemfile', 'requirements.txt']
      .includes(path.basename(file.path))) score += 45;

  score -= Math.min(Math.floor(file.lines / 200), 20);

  return score;
}

function rankFiles(files) {
  return [...files].sort((a, b) => valueRank(b) - valueRank(a));
}

function readFileEntry(absPath, relPath, skipped) {
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    skipped.push({ path: relPath, reason: 'unreadable' });
    return null;
  }

  if (stat.size > MAX_FILE_BYTES) {
    skipped.push({ path: relPath, reason: `too large (${Math.round(stat.size / 1024)}KB)` });
    return null;
  }

  if (isProbablyBinary(absPath)) {
    skipped.push({ path: relPath, reason: 'binary' });
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch {
    skipped.push({ path: relPath, reason: 'unreadable' });
    return null;
  }

  if (raw.indexOf(String.fromCharCode(0)) !== -1) {
    skipped.push({ path: relPath, reason: 'binary' });
    return null;
  }

  const allLines = raw.split(/\r?\n/);
  const totalLines = allLines.length;
  const { content, truncated, mode } = assembleContent(allLines, totalLines);

  return {
    path: relPath.split(path.sep).join('/'),
    language: detectLanguage(path.basename(relPath)),
    lines: totalLines,
    content,
    truncated,
    mode,
    bytes: stat.size,
  };
}

function walkDir(dir, rootPath, rules, results, skipped) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = path.relative(rootPath, absPath);
    if (!relPath) continue;

    const isDir = entry.isDirectory();
    const isFile = entry.isFile();

    if (!isDir && !isFile) continue;
    if (shouldIgnore(relPath, isDir, rules)) continue;

    if (isDir) {
      walkDir(absPath, rootPath, rules, results, skipped);
    } else {
      const fileEntry = readFileEntry(absPath, relPath, skipped);
      if (fileEntry) results.push(fileEntry);
    }
  }
}

function scan(targetPath) {
  const rules = loadIgnoreRules(targetPath);
  const files = [];
  const skipped = [];

  walkDir(targetPath, targetPath, rules, files, skipped);

  const ranked = rankFiles(files);
  const totalLines = ranked.reduce((sum, f) => sum + f.lines, 0);

  return {
    sourcePath: targetPath,
    totalFiles: ranked.length,
    totalLines,
    totalContentChars: ranked.reduce((sum, f) => sum + f.content.length, 0),
    ignoredBy: fs.existsSync(path.join(targetPath, '.byakuganignore'))
      ? '.byakuganignore + defaults'
      : 'defaults',

    files: ranked,
    skipped,
  };
}

module.exports = { scan, valueRank, shouldIgnore, normalizeRule, globToRegExp };