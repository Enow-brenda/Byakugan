# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What this project is

Byakugan is a Node.js CLI that scans any codebase, sends it through a multi-pass LLM pipeline, and produces an adaptive HTML report, per-file explanations, change-impact analysis, and a RAG-powered chat assistant. Built for the IBM Bob 2.0 Hackathon.

**Bob and watsonx are not used.** The repo is split in two: `package/` is the
published CLI, `backend/` is a private gateway that holds the provider
credentials. The CLI never contacts Groq or Hugging Face — it calls the backend.

## Runtime

- **Node**: pinned to `20.20.2` in `.nvmrc` — run `nvm use` before anything.
- **Package manager**: `npm` — lockfile committed, use `npm ci` for clean installs.
- **No test framework** — `npm test` exits with error. Do NOT add Jest/Vitest without approval.
- **No linter** — do NOT add ESLint/Prettier unilaterally.

## Key commands

```
npm ci                      # clean install (installs both workspaces)
npm run backend             # run the backend — cwd-relative, reads backend/.env
npm run byakugan -- doctor  # run the CLI against a local backend
cp backend/.env.example backend/.env   # first-time backend env setup
byakugan doctor             # check backend reachability + its provider health
```

## Architecture

```
package/bin/byakugan.js   Commander.js CLI router — 7 commands
package/lib/scanner.js    Directory walker, file ranker, binary detector
package/lib/batching.js   File selection + greedy batch packing within token budget
package/lib/profiler.js   5 questions → .byakugan/profile.json
package/lib/llm.js        ALL backend HTTP + SSE calls — the single outbound gateway
package/lib/analyzer.js   Multi-pass analysis orchestration → analysis.json + embeddings.json
package/lib/reporter.js   Reads analysis.json + profile.json → static HTML (no LLM calls)
package/lib/explain.js    Per-file explanation via task `explain`
package/lib/impact.js     Change-impact analysis via task `impact`
package/lib/chat.js       Adaptive RAG chat loop via task `chat`
package/lib/spinner.js    Terminal spinner utility

backend/src/index.js      HTTP server + process lifecycle
backend/src/router.js     Routes, auth, body limits, SSE, error sanitising
backend/src/tasks.js      Named-task registry — the only tasks the API accepts
backend/src/prompts.js    Loads and renders prompt templates
backend/src/providers/    groq.js, hf.js, mock.js — the only provider code
backend/src/billing.js    Shared token/rate accounting
backend/src/config.js     Environment configuration
backend/src/logger.js     Structured JSON logs
```

## Hard constraints

- **CommonJS only** — every file uses `require()`/`module.exports`. Never use `import`/`export`.
- **`package/lib/llm.js` is the ONLY file in the CLI that makes network calls**, and it may only call the Byakugan backend. Never add a provider call to the CLI.
- **Provider keys live only in `backend/src/providers/`.** `GROQ_API_KEY` and `HF_API_KEY` must never be read anywhere under `package/`.
- **Prompts live only in `backend/src/prompts/*.md`.** The published package ships no prompt text; never inline a prompt string in CLI code.
- **Callers send variables, not prompts.** Use `llm.task(name, variables)` / `llm.streamTask(...)`. There is no generic prompt-proxy endpoint, and adding one would defeat the point of the split.
- **No Bob calls anywhere** — Bob and watsonx are fully removed.
- **`reporter.js` never calls any LLM** — reads `analysis.json` only.
- **Chalk v4 only** (`^4.1.2`). v5+ is ESM-only and breaks `require()`.
- **`analysis.json`** lives in `.byakugan/` (gitignored). Never commit it.
- **Do NOT add new dependencies without asking.**

## Backend API contract

`PROTOCOL = 1` in `backend/src/config.js` and `package/lib/llm.js`. Bump both
together if the request/response shape changes incompatibly.

| Endpoint | Purpose |
|---|---|
| `GET /v1/health` | Cheap config check, no token spent. Called at CLI startup. |
| `GET /v1/health?deep=1` | Also probes both providers. Used by `doctor`. |
| `POST /v1/generate` | `{ task, variables, options? }` → `{ text, finish_reason, usage, task, protocol }` |
| `POST /v1/stream` | Same body, returns SSE `data: {"delta":…}` frames then `done`/`error` |
| `POST /v1/embed` | `{ inputs: [] }` → `{ vectors, dimensions }` |

The seven tasks are fixed: `analyze_survey`, `analyze_files`,
`analyze_synthesize`, `explain`, `impact`, `chat`, `route`.

## LLM providers (backend only)

| Concern | Provider | Default model |
|---|---|---|
| Generation + routing | Groq | `openai/gpt-oss-120b` (env: `LLM_MODEL`) |
| Embeddings | Hugging Face Inference API | `BAAI/bge-small-en-v1.5` (env: `EMBED_MODEL`) |

Both are called via Node's built-in `https` module — no axios, no SDK.

## Environment variables

The **backend** is the only thing with a `.env` (`backend/.env`, gitignored, and
read from the backend's own directory rather than the cwd). See
`backend/.env.example`. Key ones:

- `GROQ_API_KEY` — Groq API key (required)
- `HF_API_KEY` — Hugging Face token (required for embeddings/chat)
- `BYAKUGAN_API_TOKEN` — if set, callers must present it
- `LLM_MODEL` / `EMBED_MODEL` — model overrides
- `LLM_TPM_LIMIT` — shared tokens/min budget (default 8000)
- `BYAKUGAN_MOCK` — deterministic fixtures, no real calls

The **CLI ships no `.env` and needs none.** It reads only the real environment:

- `BYAKUGAN_API_URL` — backend base URL
- `BYAKUGAN_API_TOKEN` — sent as `x-byakugan-token`
- `BATCH_CHAR_BUDGET` — characters per file-analysis batch (default 16000)
- `MAX_FILES` / `MAX_CONTENT_CHARS` — local analysis ceilings

Never print any key or token in CLI output or logs.


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
byakugan doctor                   backend reachability + its provider health
```

## Prompt files

All prompts are backend-owned. The CLI sends *variables*; `backend/src/tasks.js`
lists the required ones and returns a 400 if any is missing.

| File | Task | Placeholders |
|---|---|---|
| `analyze_survey.md` | `analyze_survey` | `{{SOURCE_PATH}}`, `{{FILE_INVENTORY}}`, `{{MANIFEST_DATA}}` |
| `analyze_files.md` | `analyze_files` | `{{SOURCE_PATH}}`, `{{BATCH_INDEX}}`, `{{BATCH_COUNT}}`, `{{BATCH_DATA}}` |
| `analyze_synthesize.md` | `analyze_synthesize` | `{{SOURCE_PATH}}`, `{{DIGEST}}` |
| `explain.md` | `explain` | `{{PROJECT_NAME}}`, `{{LEVEL_NAME}}`, `{{LEVEL}}`, `{{INTENT}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`, `{{LINES}}`, `{{COMPLEXITY}}`, `{{PURPOSE}}`, `{{EXPORTS}}`, `{{IMPORTS}}`, `{{RELATED_CHUNKS}}` |
| `impact.md` | `impact` | `{{PROJECT_NAME}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`, `{{COMPLEXITY}}`, `{{PURPOSE}}`, `{{HOTSPOT}}`, `{{DEPENDENTS}}`, `{{DEPENDENCIES}}`, `{{EDGES}}`, `{{MUTATIONS}}` |
| `chat.md` | `chat` | `{{PROJECT_NAME}}`, `{{PROJECT_SUMMARY}}`, `{{RETRIEVED_CHUNKS}}` |
| `route.md` | `route` | `{{QUESTION}}` |

`analyze.md` also sits in that directory but is not registered and not used.

## Commit conventions

`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`

## Security

- Never commit `.env` or `.byakugan/` — both are gitignored; do not remove those entries.
- `backend/.env` is the only `.env` in the repo. The CLI deliberately ships none.
- Do not edit `package-lock.json` by hand.

