# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What this project is

Byakugan is a Node.js CLI that scans any codebase, sends it through a multi-pass LLM pipeline, and produces an adaptive HTML report, per-file explanations, change-impact analysis, and a RAG-powered chat assistant. Built for the IBM Bob 2.0 Hackathon.

**Bob and watsonx are not used.** All LLM calls go through Groq (generation) and Hugging Face (embeddings) via `lib/llm.js`.

## Runtime

- **Node**: pinned to `20.20.2` in `.nvmrc` — run `nvm use` before anything.
- **Package manager**: `npm` — lockfile committed, use `npm ci` for clean installs.
- **No test framework** — `npm test` exits with error. Do NOT add Jest/Vitest without approval.
- **No linter** — do NOT add ESLint/Prettier unilaterally.

## Key commands

```
npm ci                  # clean install
npm link                # exposes `byakugan` binary globally
node bin/byakugan.js    # run CLI directly
cp .env.example .env    # first-time env setup
byakugan doctor         # verify API keys + provider connectivity
```

## Architecture

```
bin/byakugan.js       Commander.js CLI router — 7 commands
lib/scanner.js        Directory walker, file ranker, binary detector
lib/batching.js       File selection + greedy batch packing within token budget
lib/profiler.js       5 questions → .byakugan/profile.json
lib/llm.js            ALL LLM + embedding calls — single gateway, nothing else calls Groq/HF
lib/analyzer.js       Multi-pass analysis orchestration → analysis.json + embeddings.json
lib/reporter.js       Reads analysis.json + profile.json → static HTML (no LLM calls)
lib/explain.js        Per-file explanation using analysis.json + llm.chat
lib/impact.js         Change-impact analysis using chakra network + llm.chat
lib/chat.js           Adaptive RAG chat loop
lib/spinner.js        Terminal spinner utility
templates/prompts/    All prompt .md files — never inline prompt strings in JS
```

## Hard constraints

- **CommonJS only** — every file uses `require()`/`module.exports`. Never use `import`/`export`.
- **`lib/llm.js` is the ONLY file that makes HTTP calls to Groq or HF.** Never add Groq/HF calls elsewhere.
- **No Bob calls anywhere** — Bob and watsonx are fully removed.
- **Prompts go in `templates/prompts/*.md`** — never inline prompt strings in JS.
- **`reporter.js` never calls any LLM** — reads `analysis.json` only.
- **Chalk v4 only** (`^4.1.2`). v5+ is ESM-only and breaks `require()`.
- **`analysis.json`** lives in `.byakugan/` (gitignored). Never commit it.
- **Do NOT add new dependencies without asking.**

## LLM providers

| Concern | Provider | Default model |
|---|---|---|
| Generation + routing | Groq | `openai/gpt-oss-120b` (env: `LLM_MODEL`) |
| Embeddings | Hugging Face Inference API | `BAAI/bge-small-en-v1.5` (env: `EMBED_MODEL`) |

Both are called via Node's built-in `https` module — no axios, no SDK.

## Environment variables (see `.env.example`)

- `GROQ_API_KEY` — Groq API key (required)
- `HF_API_KEY` — Hugging Face token (required for embeddings/chat)
- `LLM_MODEL` — override generation model
- `EMBED_MODEL` — override embedding model
- `LLM_TPM_LIMIT` — tokens/min budget for Groq rate pacing (default 8000)
- `BATCH_CHAR_BUDGET` — characters per file-analysis batch (default 16000)
- Never print any of these in CLI output or logs.

## Runtime output (all gitignored, written under the ANALYZED project)

```
<project>/.byakugan/
  profile.json        user profile
  analysis.json       full LLM output — source of truth for all commands
  embeddings.json     chunk vectors for RAG chat
  report.html         generated report
  partial/            resume cache for interrupted analyze runs
```

## Commands

```
byakugan profile                  5-question setup → profile.json
byakugan analyze <path>           multi-pass analysis → analysis.json + embeddings.json
byakugan report [-o out] [-p dir] render HTML report
byakugan explain <file> [-p dir]  per-file LLM explanation
byakugan impact <file> [-p dir]   change-impact analysis
byakugan chat [--rag|--no-rag]    RAG chat loop
byakugan doctor                   check keys + provider reachability
```

## Prompt files

| File | Used by | Placeholders |
|---|---|---|
| `analyze_survey.md` | `analyzer.js` pass 1 | `{{SOURCE_PATH}}`, `{{FILE_INVENTORY}}`, `{{MANIFEST_DATA}}` |
| `analyze_files.md` | `analyzer.js` pass 2..N | `{{SOURCE_PATH}}`, `{{BATCH_INDEX}}`, `{{BATCH_COUNT}}`, `{{BATCH_DATA}}` |
| `analyze_synthesize.md` | `analyzer.js` final pass | `{{SOURCE_PATH}}`, `{{DIGEST}}` |
| `explain.md` | `explain.js` | `{{PROJECT_NAME}}`, `{{LEVEL_NAME}}`, `{{LEVEL}}`, `{{INTENT}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`, `{{LINES}}`, `{{COMPLEXITY}}`, `{{PURPOSE}}`, `{{EXPORTS}}`, `{{IMPORTS}}`, `{{RELATED_CHUNKS}}` |
| `impact.md` | `impact.js` | `{{PROJECT_NAME}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`, `{{COMPLEXITY}}`, `{{PURPOSE}}`, `{{HOTSPOT}}`, `{{DEPENDENTS}}`, `{{DEPENDENCIES}}`, `{{EDGES}}`, `{{MUTATIONS}}` |
| `chat.md` | `chat.js` | `{{PROJECT_NAME}}`, `{{PROJECT_SUMMARY}}`, `{{RETRIEVED_CHUNKS}}` |
| `route.md` | `llm.js` → `routeQuery()` | `{{QUESTION}}` |

## Commit conventions

`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`

## Security

- Never commit `.env` or `.byakugan/` — both are gitignored; do not remove those entries.
- Do not edit `package-lock.json` by hand.
