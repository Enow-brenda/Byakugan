# Plan: Implement the `analyze` Command

## Overview

Implement the `byakugan analyze <path>` command end-to-end. This covers:

1. The `analysis.json` schema — the single source of truth that every other command reads.
2. `lib/scanner.js` — walks the target directory and builds a structured payload.
3. `templates/prompts/analyze.md` — the prompt template Bob receives, now fed scanned data.
4. `lib/analyzer.js` — orchestrates scanner → prompt → Bob → save.
5. `bin/byakugan.js` — wiring Commander.js to the analyze entry point.

Bob runs **once**, receiving pre-scanned file data. It does not traverse the filesystem itself.
The reporter reads `analysis.json`; it never calls Bob.

---

## Architecture: Why a Scanner

Bob Shell's non-interactive mode requires API key auth that is not yet set up. More importantly,
asking Bob to traverse an unknown filesystem is fragile — it cannot read files reliably in
headless mode. The scanner solves both problems:

- JS does the filesystem work reliably and fast.
- Bob receives a single, complete, structured prompt — no file access needed on Bob's side.
- The prompt size is controlled: full content for files ≤200 lines, truncated preview for larger.

```
analyze(path)
  └─ scanner.scan(path)        ← NEW: JS walks the tree, reads files
       └─ returns ScanResult
  └─ buildPrompt(ScanResult)   ← embeds scan data into analyze.md template
  └─ callBob(promptText)       ← bob -p "<full prompt>"
  └─ parseAndValidate(raw)
  └─ saveAnalysis(data)
```

---

## Level Mapping

| Level | Name |
|-------|------|
| 1 | Junior |
| 2 | Mid |
| 3 | Senior |
| 4 | Lead |
| 5 | GodMode |

---

## `analysis.json` Schema

Lives at `.byakugan/analysis.json` (gitignored). Bob fills it in one pass from scanned data.

```jsonc
{
  "schema_version": "1.0.0",
  "analyzed_at": "<ISO-8601>",
  "source_path": "/abs/path/to/repo",

  "project": {
    "name": "string",
    "description": "string",
    "primary_language": "string",
    "secondary_languages": [],
    "framework": "string | null",
    "package_manager": "string | null"
  },

  "overview": {
    "summary": "string",
    "entry_points": [],
    "architecture_pattern": "string | null",
    "total_files": 0,
    "total_lines": 0,
    "has_tests": false,
    "test_coverage_estimate": "string | null"
  },

  "chakra_network": {
    "nodes": [
      { "id": "string", "label": "string", "type": "string", "file": "string | null", "line": 0 }
    ],
    "edges": [
      { "from": "string", "to": "string", "kind": "string" }
    ]
  },

  "techniques": [
    {
      "name": "string",
      "category": "string",
      "what_it_is": "string",
      "why_it_matters": "string",
      "without_it": "string",
      "occurrences": [ { "file": "string", "line": 0, "snippet": "string" } ],
      "significance": "string"   // optional — empty string if Bob is unsure
    }
  ],

  "impact_sight": {
    "hotspots": [ { "file": "string", "reason": "string", "risk": "string" } ],
    "state_mutations": [ { "file": "string", "symbol": "string", "kind": "string" } ],
    "external_dependencies": [ { "name": "string", "used_in": [], "is_dev_only": false } ]
  },

  "files": [
    {
      "path": "string",
      "language": "string",
      "lines": 0,
      "purpose": "string",
      "exports": [ { "name": "string", "kind": "string", "signature": "string" } ],
      "imports": [ { "source": "string", "names": [] } ],
      "complexity": "string"
    }
  ],

  "quiz": {
    "questions": [
      {
        "id": "string",
        "intent": "string",
        "level": 0,
        "type": "string",
        "question": "string",
        "options": [],
        "correct": "string",
        "ideal_answer": "string",
        "explanation": "string",
        "references": []
      }
    ]
  }
}
```

---

## `lib/scanner.js` — Design

### What it does

Walks the target directory recursively. For each non-ignored file it collects:
- Relative path, detected language, line count
- Full content if ≤200 lines; first 200 lines + `[truncated]` marker if larger

Returns a single `ScanResult` object consumed by `buildPrompt`.

### Ignore rules (two layers)

**Layer 1 — hardcoded defaults (always applied):**
```
node_modules/   .git/   dist/   build/   .byakugan/
*.lock          *.log   .env    .env.*
```

**Layer 2 — `.byakuganignore` in the target project root (optional):**
- Same line-by-line glob syntax as `.gitignore`
- Merged with defaults at scan time
- If absent, only defaults apply

### ScanResult shape

```js
{
  sourcePath: "/abs/path",          // absolute path scanned
  totalFiles: 42,
  totalLines: 3100,
  ignoredBy: ".byakuganignore",     // or "defaults" or "both"
  files: [
    {
      path: "src/index.js",         // relative
      language: "JavaScript",       // inferred from extension
      lines: 85,
      content: "full file content", // full if ≤200 lines
      truncated: false
    },
    {
      path: "src/bigfile.js",
      language: "JavaScript",
      lines: 950,
      content: "first 200 lines...\n[truncated: 750 lines not shown]",
      truncated: true
    }
  ]
}
```

### Functions

| Function | Input | Output |
|---|---|---|
| `loadIgnoreRules(targetPath)` | abs path to project root | array of glob patterns |
| `shouldIgnore(relPath, rules)` | relative path + rules | boolean |
| `detectLanguage(filename)` | filename string | language string |
| `readFileEntry(absPath, relPath)` | paths | file entry object |
| `scan(targetPath)` | abs path | ScanResult |

`scan` is the only export used by `analyzer.js`.

### Language detection (extension map, no new deps)

```
.js .mjs .cjs  → JavaScript
.ts .tsx       → TypeScript
.jsx           → JavaScript (JSX)
.py            → Python
.java          → Java
.go            → Go
.rs            → Rust
.rb            → Ruby
.php           → PHP
.cs            → C#
.cpp .cc .cxx  → C++
.c             → C
.html .htm     → HTML
.css           → CSS
.scss .sass    → SCSS
.json          → JSON
.md .markdown  → Markdown
.yaml .yml     → YAML
.sh .bash      → Shell
.sql           → SQL
(anything else)→ Text
```

---

## `lib/analyzer.js` — Changes

`buildPrompt` changes signature: it now receives the `ScanResult` object (not just a path).
It still reads `templates/prompts/analyze.md` as the template, but replaces two placeholders:
- `{{SOURCE_PATH}}` → `scanResult.sourcePath`
- `{{SCANNED_DATA}}` → JSON.stringify of the scanned files array (pretty-printed, 2-space indent)

`analyze` gains one new step between `validatePath` and `buildPrompt`:

```
analyze(targetPath)
  validatePath(resolved)
  scanResult = scanner.scan(resolved)    ← NEW
  promptText = buildPrompt(scanResult)   ← signature changes
  raw = callBob(promptText)
  data = parseAndValidate(raw)
  saveAnalysis(data)
```

`callBob` changes: remove the broken `run --output-format json` flags. Use:
```js
spawnSync('bob', ['-p', promptText], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
```

---

## `templates/prompts/analyze.md` — Changes

Replace the instruction *"Traverse all source files in that directory"* with:

> *"The codebase has already been scanned for you. The full file tree and contents are
> provided below as structured data. Use only this data — do not attempt to read any files
> from the filesystem."*

Replace `{{SOURCE_PATH}}` usage for path traversal with:
- `{{SOURCE_PATH}}` still used only for the `source_path` field value
- Add `{{SCANNED_DATA}}` section at the bottom of the prompt containing the JSON payload

---

## Sub-Tasks

### Sub-Task 1 — Schema + plan  `[x] done`

---

### Sub-Task 2 — `templates/prompts/analyze.md` (original)  `[x] done`
Will be updated in Sub-Task C below.

---

### Sub-Task 3 — `lib/analyzer.js` (original)  `[x] done`
Will be updated in Sub-Task B below.

---

### Sub-Task 4 — `bin/byakugan.js`  `[x] done`

---

### Sub-Task A — Create `lib/scanner.js`

**Intent:** Build the filesystem walker that replaces Bob's need to traverse the project.
This is a pure Node.js module — no new dependencies, no Bob calls.

**Expected Outcomes:**
- `lib/scanner.js` exists and exports `scan(targetPath)`.
- Running `node -e "console.log(JSON.stringify(require('./lib/scanner').scan('.'), null, 2))"` prints a valid ScanResult.
- `node_modules`, `.git`, `.env` files are never included.
- `.byakuganignore` in the target root is read and merged with defaults if present.
- Files ≤200 lines: full content. Files >200 lines: first 200 lines + truncation marker.

**Todo List:**
- [ ] Implement `loadIgnoreRules(targetPath)` — reads `.byakuganignore`, merges with hardcoded defaults.
- [ ] Implement `shouldIgnore(relPath, rules)` — checks path against patterns using simple string matching (no new deps: use `path.basename`, prefix match, and glob-style `*` via a minimal inline matcher).
- [ ] Implement `detectLanguage(filename)` — extension map lookup.
- [ ] Implement `readFileEntry(absPath, relPath)` — reads file, counts lines, truncates if >200.
- [ ] Implement `scan(targetPath)` — recursive walk using `fs.readdirSync`, assembles ScanResult.
- [ ] Export only `scan`.

**Relevant Context:**
- Node built-ins only: `fs`, `path`.
- No `glob`, `minimatch`, or `micromatch` — no new deps allowed.
- Ignore patterns need to handle: exact names (`node_modules`), extensions (`*.lock`), dotfiles (`.env`).

**Status:** `[ ] pending`

---

### Sub-Task B — Update `lib/analyzer.js`

**Intent:** Wire the scanner into the analysis pipeline and fix the broken `callBob` invocation.

**Expected Outcomes:**
- `analyze()` calls `scanner.scan()` after `validatePath`.
- `buildPrompt` accepts a `ScanResult` and injects `{{SCANNED_DATA}}`.
- `callBob` uses `spawnSync('bob', ['-p', promptText], ...)` — no `run`, no `--output-format`.
- Temp file writing in `buildPrompt` is removed (prompt is passed as a string directly).
- Progress logs updated to show scanner step.

**Todo List:**
- [ ] Add `const scanner = require('./scanner')` import.
- [ ] Update `buildPrompt(scanResult)` — replace both `{{SOURCE_PATH}}` and `{{SCANNED_DATA}}`.
- [ ] Remove temp file write/delete logic (no longer needed).
- [ ] Fix `callBob(promptText)` — `spawnSync('bob', ['-p', promptText], ...)`.
- [ ] Add scanner step in `analyze()` between `validatePath` and `buildPrompt`.
- [ ] Add chalk log `› Scanning project files...` for the new step.

**Relevant Context:** Current `callBob` uses broken `run --output-format json` flags — replace entirely.

**Status:** `[ ] pending`

---

### Sub-Task C — Update `templates/prompts/analyze.md`

**Intent:** Rewrite the prompt so Bob reasons from the injected scanned data rather than
instructing it to traverse the filesystem (which it cannot do reliably in `-p` mode).

**Expected Outcomes:**
- Prompt tells Bob the data is pre-provided, not to read files itself.
- `{{SCANNED_DATA}}` placeholder is present where the scanner payload will be injected.
- `{{SOURCE_PATH}}` is retained only for the `source_path` output field.
- All schema instructions, quiz rules, and output constraints remain unchanged.

**Todo List:**
- [ ] Replace filesystem traversal instruction with pre-scanned data instruction.
- [ ] Add `{{SCANNED_DATA}}` section after the schema definition.
- [ ] Keep all existing hard constraints and quiz generation rules.

**Relevant Context:** `buildPrompt` in Sub-Task B injects `{{SCANNED_DATA}}` — this placeholder must match exactly.

**Status:** `[ ] pending`

---

## Data Flow (updated)

```
byakugan analyze <path>
        |
        v
bin/byakugan.js  (Commander.js)
        |
        v
lib/analyzer.js
  validatePath()      --> throws if bad path
  scanner.scan()      --> walks tree, reads files, returns ScanResult   [NEW]
  buildPrompt()       --> reads analyze.md, injects SOURCE_PATH + SCANNED_DATA
  callBob()           --> spawnSync("bob", ["-p", promptText])
  parseAndValidate()  --> JSON.parse + required-key check
  saveAnalysis()      --> writes .byakugan/analysis.json
        |
        v
.byakugan/analysis.json  <- read by reporter.js, chat.js, quiz UI
```

---

## Out of Scope

- `lib/profiler.js`, `lib/reporter.js`, `lib/chat.js`
- `templates/report/` (HTML/CSS/JS)
- Intent x level rendering templates, quiz UI
- Watson/watsonx prompts
