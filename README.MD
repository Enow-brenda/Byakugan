# 👁 Byakugan

> 360° vision into any codebase — an adaptive code comprehension CLI built for the IBM Bob 2.0 Hackathon.

Byakugan scans any codebase, sends it through a multi-pass LLM pipeline, and gives you an adaptive HTML report, an interactive quiz, per-file explanations, change-impact analysis, and a RAG-powered chat assistant — all tailored to your skill level and intent.

---

<!-- ⚠️  SCREENSHOT REQUIRED -->
<!-- Place a terminal or browser screenshot at bob_session/images/demo.png -->
<!-- See bob_session/images/IMAGES_NEEDED.md for the full list of required images -->
![Byakugan demo](bob_session/images/demo.png)

---

## Features

| Command | What it does |
|---|---|
| `byakugan profile` | 5 questions → saves your skill level + intent to `profile.json` |
| `byakugan analyze <path>` | Multi-pass LLM analysis → `analysis.json` + `embeddings.json` |
| `byakugan report` | Self-contained interactive HTML report, opened in your browser |
| `byakugan explain <file>` | Deep plain-English explanation of one file, adapted to your level |
| `byakugan impact <file>` | Structured change-impact analysis — what breaks if this file changes |
| `byakugan chat` | RAG-powered interactive chat about the codebase |
| `byakugan doctor` | Checks backend reachability, your token, and the provider health behind it |

---

## Architecture

This is one repository with two deployable halves.

```
package/                     ← the published npm CLI. No API keys, ever.
  bin/byakugan.js            Commander.js CLI router
  lib/scanner.js             Walks target directory — ranks, filters, detects binary
  lib/batching.js            File selection + greedy batch packing within token budget
  lib/profiler.js            5-question interactive setup → .byakugan/profile.json
  lib/llm.js                 ALL backend calls (HTTP + SSE) — the only file that talks
                             to the network, and it only ever talks to Byakugan
  lib/analyzer.js            Multi-pass orchestration → analysis.json + embeddings.json
  lib/reporter.js            Reads analysis.json + profile.json → self-contained HTML
  lib/explain.js             Per-file explanation via the `explain` backend task
  lib/impact.js              Change-impact analysis via the `impact` backend task
  lib/chat.js                Adaptive RAG chat loop via the `chat` backend task
  lib/spinner.js             Terminal spinner
  templates/report/          The offline HTML report (CSS/JS/partials, ASCII-only)

backend/                     ← the private service. Holds every credential.
  src/index.js               HTTP server + process lifecycle
  src/router.js              Routes, auth, body limits, SSE, error sanitising
  src/tasks.js               Named-task registry — the CLI may only ask for these
  src/prompts.js             Loads and renders prompt templates
  src/prompts/*.md           Every prompt lives here, not in the published package
  src/providers/groq.js      Groq generation + streaming (reads GROQ_API_KEY)
  src/providers/hf.js        Hugging Face embeddings (reads HF_API_KEY)
  src/providers/mock.js      Deterministic fixtures, for running with no keys
  src/billing.js             Shared token/rate accounting
  src/http-client.js         Timeout + retry + concurrency for provider calls
  src/config.js              Environment configuration
  src/logger.js              Structured JSON logs

.byakugan/                   Runtime output in the ANALYSED project — gitignored
  profile.json
  analysis.json
  embeddings.json
  report.html
  partial/                   Resume cache for an interrupted analyze
```

### Why the split

The published package contains **no provider credentials and no prompt text**. It
cannot call Groq or Hugging Face even if someone unpacks it and reads it. Every
model call goes to a Byakugan backend, which authenticates the caller, checks the
named task against a fixed allowlist, renders the prompt server-side, and only
then talks to a provider.

The practical consequences:

- **Rotating a provider key** never requires a new npm release.
- **Editing a prompt** never requires a new npm release either — users get the
  improvement on their next command.
- **A leaked key** costs you one key, not a fleet of installs.
- **The endpoint is not a generic prompt proxy.** `/v1/generate` takes a task name
  and a bag of variables, not a prompt string. There is nothing to submit that
  isn't already one of the seven things the product is supposed to do.
- **Per-tenant rate and spend limits** live in one place, where they can actually
  be enforced.

The tradeoff is honest: the backend must be an always-on host, and there is a
network hop in the hot path. Serverless is not a good fit — cold starts would
land in the middle of a streaming answer.

---

## How the Analysis Pipeline Works

```
byakugan analyze <path>
        │
        ▼
  scanner.scan()
  Walks the directory, ranks files by signal value (source > config > docs),
  skips binaries, applies .byakuganignore rules.
        │
        ▼
  batching.packBatches()
  Greedy first-fit packing — high-value files land in the earliest batches.
  Budget: ~16 000 chars / batch (~5 300 tokens).
        │
        ▼
  startup: GET /v1/health
  A bad backend URL or token costs one second here, rather than surfacing
  three minutes in after the directory walk has already finished.
        │
        ▼
  Pass 1 — Survey            POST /v1/generate  task=analyze_survey
  Backend renders the prompt from the file inventory + manifests
  (package.json, README, etc.)
  → project name, language, architecture, entry points, summary
        │
        ▼
  Pass 2..N — File batches    task=analyze_files
  → per-file purpose, exports, imports, techniques,
    hotspots, state mutations, module-graph edges, external dependencies
        │
        ▼
  Final pass — Synthesis      task=analyze_synthesize
  → cross-batch graph edges, ranked hotspots, 10 quiz questions
        │
        ▼
  mergePasses()
  Deduplicates techniques, nodes, edges, dependencies across all passes.
  Hotspot risk is always the maximum seen across any pass.
        │
        ▼
  analysis.json saved
  Single source of truth for report, explain, impact, and chat.
        │
        ▼
  buildAndSaveEmbeddings()
  Chunks analysis.json into semantically meaningful pieces
  (overview, file:*, technique:*, hotspot:*, dep:*),
  POST /v1/embed for each batch, saves embeddings.json for the RAG chat index.
```

---

## How the RAG Chat Works

```
byakugan chat
        │
        ▼
  Loads analysis.json + embeddings.json + profile.json
  Selects mode: full-context (small analysis) or retrieval (large analysis)
        │
        ▼
  You ask a question
        │
        ▼ (--smart-route only)
  task=route → SEARCH or CHAT
        │
        ▼
  SEARCH ──▶ POST /v1/embed(question)
             cosine similarity vs all chunks in embeddings.json
             top-3 chunks retrieved
        │
        ▼
  POST /v1/stream  task=chat
  The backend assembles the system prompt from chat.md plus a reader-profile
  section keyed off your level and intent. Junior gets oriented, Senior gets
  tradeoffs. The CLI sends the ingredients, not the finished message.
        │
        ▼
  Answer streams back over SSE — history updated
```

---

## Quick Start

### For users (installing the CLI)

```bash
nvm use            # Node 20 required — see .nvmrc
npm install -g byakugan-macgpt

byakugan doctor    # confirm the backend is reachable
byakugan profile                        # set your skill level + intent
byakugan analyze ./path/to/any/repo     # analyse a codebase
byakugan report                         # open .byakugan/report.html
byakugan explain lib/analyzer.js        # explain one file
byakugan impact lib/analyzer.js         # blast-radius analysis
byakugan chat                           # ask anything about the codebase
```

The CLI needs no configuration. If you are pointing at your own backend rather
than the hosted one, set two environment variables:

| Variable | Purpose |
|---|---|
| `BYAKUGAN_API_URL` | Backend base URL. Defaults to the hosted backend. |
| `BYAKUGAN_API_TOKEN` | Sent as `x-byakugan-token`. Only needed if the backend requires one. |

### For developers (running both halves)

```bash
git clone <your-repo-url>
cd byakugan
nvm use          # Node 20 required — see .nvmrc
npm ci           # installs both workspaces

# Terminal 1 — the backend, which is where the keys live
cp backend/.env.example backend/.env
# fill in GROQ_API_KEY and HF_API_KEY (both free — see below)
npm run backend

# Terminal 2 — the CLI
npm run byakugan -- doctor
```

Or run a local backend with no keys at all, using deterministic fixtures:

```bash
BYAKUGAN_MOCK=true npm run backend
```

Mock mode is for exercising the protocol end to end. It never returns a real
model response, and it refuses to start in production unless you also set
`BYAKUGAN_ALLOW_MOCK=true`.

---

## Getting Your API Keys

Both keys are **free with no credit card required**, and both belong to the
**backend only**. The CLI never sees them.

| Key | Where to get it | What the backend uses it for |
|---|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | LLM generation + query routing |
| `HF_API_KEY` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) — create a "Read" token | Chunk embeddings for RAG chat |

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ | — | Groq API key |
| `HF_API_KEY` | ✅ | — | Hugging Face token |
| `BYAKUGAN_API_TOKEN` | — | unset | If set, callers must present it. Strongly recommended in production. |
| `PORT` | — | `3000` | Port to listen on |
| `HOST` | — | `0.0.0.0` | Interface to bind |
| `NODE_ENV` | — | `development` | Set to `production` in deployment |
| `LLM_MODEL` | — | `openai/gpt-oss-120b` | Override generation model |
| `EMBED_MODEL` | — | `BAAI/bge-small-en-v1.5` | Override embedding model |
| `LLM_REASONING_EFFORT` | — | provider default | `low` \| `medium` \| `high` |
| `LLM_MAX_COMPLETION_TOKENS` | — | `16000` | Output token ceiling per call |
| `LLM_TIMEOUT_MS` | — | `120000` | Per-provider-request timeout in ms |
| `LLM_MAX_ATTEMPTS` | — | `4` | Retries on 429/5xx/socket errors |
| `LLM_TPM_LIMIT` | — | `8000` | Shared tokens/min budget. Raise for a paid tier. |
| `BYAKUGAN_MAX_TOKENS_PER_DAY` | — | unset | Optional daily ceiling across all callers |
| `BYAKUGAN_TOKEN_TPM_LIMIT` | — | unset | Optional per-token rate limit |
| `BYAKUGAN_MAX_BODY_BYTES` | — | `2000000` | Request body ceiling |
| `BYAKUGAN_MAX_EMBED_INPUTS` | — | `64` | Max inputs per embed call |
| `BYAKUGAN_MOCK` | — | `false` | Serve deterministic fixtures instead of calling providers |
| `BYAKUGAN_ALLOW_MOCK` | — | `false` | Required to permit mock mode when `NODE_ENV=production` |
| `BYAKUGAN_LOG_LEVEL` | — | `info` | `debug` \| `info` \| `warn` \| `error` |

### CLI (real environment only — the package ships no `.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `BYAKUGAN_API_URL` | — | hosted backend | Backend base URL |
| `BYAKUGAN_API_TOKEN` | — | unset | Token to send as `x-byakugan-token` |
| `MAX_FILES` | — | `800` | Hard ceiling on files sent per run |
| `MAX_CONTENT_CHARS` | — | `1500000` | Hard ceiling on total content characters |
| `BATCH_CHAR_BUDGET` | — | `16000` | Characters per file-analysis batch |
| `BYAKUGAN_REVEAL_CPS` | — | `40` | Streaming reveal pace. `0` prints as fast as the backend delivers. |

---

## Backend API

Small, versioned, and deliberately not a prompt proxy. `PROTOCOL = 1`; the CLI
checks it during the startup health probe, so a version mismatch produces a
"update whichever is older" message instead of an inscrutable parse error.

| Endpoint | Purpose |
|---|---|
| `GET /v1/health` | Cheap config check. No token spent. |
| `GET /v1/health?deep=1` | Also probes both providers. Used by `doctor`. |
| `GET /v1/tasks` | The task allowlist, with required variables per task. |
| `POST /v1/generate` | `{ task, variables, options? }` → `{ text, finish_reason, usage, task, protocol }` |
| `POST /v1/stream` | Same body; returns SSE `data: {"delta":…}` frames, then `done` or `error`. |
| `POST /v1/embed` | `{ inputs: [] }` → `{ vectors: [[…]], dimensions }` |

Auth, when `BYAKUGAN_API_TOKEN` is set, is `x-byakugan-token: <token>` or
`Authorization: Bearer <token>`.

Tasks are fixed: `analyze_survey`, `analyze_files`, `analyze_synthesize`,
`explain`, `impact`, `chat`, `route`. Anything else is a `404`.

---

## Command Reference

### `byakugan profile`
Interactive 5-question setup. Saves your name, intent, skill level (Junior → GodMode), focus area, and notes. Every other command adapts to this profile.

### `byakugan analyze <path> [--max-files N] [--max-chars N]`
Multi-pass LLM analysis. Produces `analysis.json` and `embeddings.json` inside `<path>/.byakugan/`. Automatically resumes if interrupted — partial pass results are cached in `.byakugan/partial/`.

### `byakugan report [-o output.html] [-p project-path] [--no-open]`
Renders a self-contained HTML report and opens it in your browser. If `profile.json` is missing it asks first; if `analysis.json` is missing it offers to run analyze. Use `--no-open` in CI, or set `BYAKUGAN_NO_OPEN=1`, to write the file without launching anything.

The report is one file with no external requests, so it works from disk, offline, and with scripts disabled. It opens with a Byakugan activation sequence, then:

| Section | What it does |
|---|---|
| **Mission Dossier** | Stamped mission directive, your rank on a five-rung ladder, project cards, field report, entry points |
| **Chakra Flow** | Interactive dependency graph. Hover to light everything a node touches, click to pin, drag to pan, scroll to zoom. Toggle to a table for the same data. |
| **Jutsu Library** | Techniques with what-it-is / why-it-matters / without-it, plus the code that proves each one. Filter by load-bearing. |
| **Fovea Vision** | Blast radius per file, mutable state, and the ropes to the outside world. |
| **Shinobi Registry** | Every file with purpose, line count, and a complexity meter. Sortable columns, filter box. |
| **The Dojo** | A knowledge check scored in the page, with a rank stamp at the end. |

Also: `Ctrl K` (or `/`) opens a command palette, the theme button switches to a light theme, and the whole document prints cleanly to PDF.

### `byakugan explain <file> [-p project-path]`
Looks up the file in `analysis.json` and asks for a focused explanation: what the file does, its key exports, what depends on it, and anything non-obvious. Output adapted to your profile level.

### `byakugan impact <file> [-p project-path]`
Structured blast-radius analysis: direct dependents, second-order risk, state mutation risk, safe change zones, and a recommended approach. Uses the chakra network edges from `analysis.json`.

### `byakugan chat [--rag] [--no-rag] [--smart-route] [-p project-path]`
RAG-powered chat. Automatically uses full-context mode for small analyses and retrieval mode for large ones. `--smart-route` adds an LLM call to classify each question before retrieving. Keeps a rolling 10-turn history.

### `byakugan doctor`
Prints the backend URL, protocol version, mode (live or mock), and local analysis budgets, then asks the backend for a deep health check and prints a green ✓ or red ✗ per provider. There are no keys to check on this side any more — that is the point.

---

## Deploying the Backend

Any always-on Node host works. Two things matter: it must stay up between calls,
and `NODE_ENV` must be `production`.

**Render / Railway / Fly**

| Setting | Value |
|---|---|
| Build command | `npm ci` |
| Start command | `node backend/src/index.js` |
| Health check path | `/v1/health` |
| Node version | 20 (`.nvmrc`) |

Set `GROQ_API_KEY`, `HF_API_KEY`, `BYAKUGAN_API_TOKEN`, and `NODE_ENV=production`
in the platform's secret store — not in a committed file. Real environment
variables always take precedence over `backend/.env`, so the same build runs
unchanged locally and in production.

**Self-hosted**

```bash
NODE_ENV=production \
GROQ_API_KEY=… HF_API_KEY=… BYAKUGAN_API_TOKEN=… \
node backend/src/index.js
```

Put it behind TLS. The token is a bearer credential.

---

## Project Structure

```
byakugan/
├── package/                     the published npm CLI
│   ├── bin/byakugan.js
│   ├── lib/
│   │   ├── analyzer.js
│   │   ├── batching.js
│   │   ├── chat.js
│   │   ├── explain.js
│   │   ├── impact.js
│   │   ├── llm.js
│   │   ├── profiler.js
│   │   ├── reporter.js
│   │   ├── scanner.js
│   │   └── spinner.js
│   ├── templates/report/        the offline HTML report
│   └── package.json
├── backend/                     the private LLM gateway
│   ├── src/
│   │   ├── index.js
│   │   ├── router.js
│   │   ├── tasks.js
│   │   ├── prompts.js
│   │   ├── config.js
│   │   ├── billing.js
│   │   ├── http-client.js
│   │   ├── logger.js
│   │   ├── prompts/*.md
│   │   └── providers/{groq,hf,mock}.js
│   ├── .env.example
│   └── package.json
├── bob_session/
│   ├── images/              ← screenshots go here
│   ├── plan.md
│   └── session_notes.md
├── .nvmrc
└── package.json               private workspace root
```

---

## Built for the IBM Bob 2.0 Hackathon

**Team:** Brenda ([@Enow-brenda](https://github.com/Enow-brenda)) & Naran ([@Naran121x](https://github.com/Naran121x))

See [`bob_session/`](bob_session/) for the implementation plan and full session notes.

---

## License

MIT
