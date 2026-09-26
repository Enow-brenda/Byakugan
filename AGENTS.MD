# Byakugan — Agent Context

## What this project is
Byakugan is a Node.js CLI that analyzes any codebase and generates an adaptive HTML report (skill level + intent aware). Built for the IBM Bob 2.0 Hackathon. Bob runs **once** per analysis; the report, quiz, and chat all read from a saved `analysis.json`. Never call Bob during report rendering.

## Runtime and tooling
- **Package manager**: `npm` — the lockfile is committed, use `npm ci` for clean installs.
- **Test runner**: No framework yet. Use `npm test` (currently a placeholder). Do not add Jest/Vitest without approval.
- **Lint**: Not configured. Do not add ESLint/Prettier unilaterally.
- **Node version**: Pinned in `.nvmrc` (20.11.0). Use `nvm use` before running anything.

## Setup commands
- Install deps: `npm install`
- Link CLI locally: `npm link` (makes `byakugan` command available globally)
- Copy env: `cp .env.example .env` then fill in real keys
- Run CLI: `byakugan --help` or `node bin/byakugan.js`

## Non-obvious constraints (read these or Bobcoins get burned)
- **Bob is called ONLY in `lib/analyzer.js`.** The `analyze` command triggers it. Every other command (`explain`, `impact`, `chat`) reads from pre-saved JSON. Do not add `bob run` calls elsewhere.
- **`analysis.json` is the single source of truth** for the report. It lives in `.byakugan/` (gitignored). Never commit it.
- **Chalk v4 only.** v5+ is ESM-only and breaks CommonJS `require()`.
- **Prompts live in `templates/prompts/*.md`** — never inline strings in JavaScript.
- **The report is static HTML.** No Bob calls during rendering. `lib/reporter.js` reads `analysis.json` and fills templates.

## Project structure
- `bin/byakugan.js` — CLI entry (Commander.js). Routes commands to `lib/`.
- `lib/profiler.js` — Profile capture (5 questions → `.byakugan/profile.json`).
- `lib/analyzer.js` — Bob integration. Runs once, saves `analysis.json`.
- `lib/reporter.js` — Reads `analysis.json`, generates HTML.
- `lib/chat.js` — watsonx.ai RAG chat (uses saved analysis, not Bob).
- `templates/prompts/` — Bob prompt markdown files.
- `templates/report/` — HTML/CSS/JS for the report UI.

## Security / do not touch
- **Never commit `.env` or `.byakugan/`.** They are gitignored; do not remove them from `.gitignore`.
- **Never print API keys** in CLI output or logs.
- **Do not modify `package-lock.json` by hand.** Only `npm install` should change it.

## Commit conventions
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that doesn't add a feature
- `chore:` — tooling, deps, config

## Boundaries
- Do NOT add new dependencies without asking.
- Do NOT call Bob from any file other than `lib/analyzer.js`.
- Do NOT generate the HTML report by calling Bob. Use `lib/reporter.js` + templates.
- Do NOT modify `.bob/` context files unless explicitly asked.