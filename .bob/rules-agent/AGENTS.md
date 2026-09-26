# AGENTS.md — Agent (coding) mode

This file provides guidance to agents when working with code in this repository.

## Critical coding rules

- **All `lib/*.js` and `bin/byakugan.js` are stubs.** Don't read them expecting real logic — they contain only a comment or are empty. Implement from scratch.
- **CommonJS only** — every file uses `require()`/`module.exports`. Never use `import`/`export`.
- **Bob (`bob run`) allowed only in `lib/analyzer.js`** — not in reporter, chat, profiler, or CLI router.
- **Chalk v4** is pinned (`^4.1.2`). Importing chalk works as `const chalk = require('chalk')`. Do not upgrade — v5 breaks `require()`.
- **No test runner exists** — `npm test` fails by design. Don't write test files or runner config without explicit approval.
- **No linter** — do not create `.eslintrc`, `.prettierrc`, or similar configs.

## File write pattern
- Runtime output (analysis, profiles) goes under `.byakugan/` (auto-created at runtime, gitignored). Use `fs.mkdirSync('.byakugan', { recursive: true })` before writing.
- Report HTML output should be a single self-contained file (no external asset references), written to a path the user specifies or defaults to `.byakugan/report.html`.

## Prompt files
- All Bob prompt text lives in `templates/prompts/*.md`. Read them with `fs.readFileSync` in `lib/analyzer.js` before passing to Bob. Never hardcode prompt strings in JS.

## Dependency constraint
- Only these packages are available: `@ibm-cloud/watsonx-ai`, `@langchain/community`, `chalk@4`, `commander`, `dotenv`. Do not `require()` anything else without adding it to `package.json` first (and asking approval).
