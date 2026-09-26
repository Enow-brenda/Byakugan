# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What this project is
Byakugan is a Node.js CLI that analyzes any codebase and generates an adaptive HTML report (skill level + intent aware). Built for the IBM Bob 2.0 Hackathon. Bob runs **once** per analysis; the report, quiz, and chat all read from a saved `analysis.json`. Never call Bob during report rendering.

## Status — early scaffold
All `lib/*.js` files are currently stubs (single-line comments or empty). `bin/byakugan.js` only prints a greeting. `templates/prompts/` and `templates/report/` are empty directories. **Implement, don't assume existing logic exists.**

## Runtime
- **Node**: pinned to `20.20.2` in `.nvmrc` — run `nvm use` before anything.
- **Package manager**: `npm` — lockfile committed, use `npm ci` for clean installs.
- **No test framework yet** — `npm test` exits with error. Do NOT add Jest/Vitest without approval.
- **No linter** — do NOT add ESLint/Prettier unilaterally.

## Key commands
```
npm ci                  # clean install
npm link                # exposes `byakugan` binary globally
node bin/byakugan.js    # run CLI directly
cp .env.example .env    # first-time env setup
```

## Hard constraints
- **Bob is called ONLY in `lib/analyzer.js`.** Never add `bob run` calls elsewhere.
- **Chalk v4 only** (`^4.1.2`). v5+ is ESM-only and breaks `require()`.
- **Prompts go in `templates/prompts/*.md`** — never inline prompt strings in JS.
- **Report is static HTML** — `lib/reporter.js` reads `analysis.json`; zero Bob calls during rendering.
- **`analysis.json`** lives in `.byakugan/` (gitignored). Never commit it.
- **Do NOT add new dependencies without asking.**

## Architecture (intended)
```
bin/byakugan.js     → Commander.js router
lib/profiler.js     → 5 questions → .byakugan/profile.json
lib/analyzer.js     → Bob integration (runs once) → .byakugan/analysis.json
lib/reporter.js     → reads analysis.json → static HTML output
lib/chat.js         → watsonx.ai RAG chat (reads analysis.json, not Bob)
templates/prompts/  → Bob prompt .md files
templates/report/   → HTML/CSS/JS for the report UI
```

## Environment variables (see `.env.example`)
- `WATSONX_API_KEY` — watsonx.ai API key
- `WATSONX_PROJECT_ID` — watsonx.ai project ID
- `WATSONX_URL` — defaults to `https://us-south.ml.cloud.ibm.com`
- Never print these in CLI output or logs.

## Commit conventions
`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`

## Security
- Never commit `.env` or `.byakugan/` — both are gitignored; do not remove those entries.
- Do not modify `.bob/` context files unless explicitly asked.
- Do not edit `package-lock.json` by hand.
