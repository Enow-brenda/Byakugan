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
| `byakugan doctor` | Checks API keys, provider reachability, and rate-limit budgets |

---

## Architecture

```
bin/byakugan.js            Commander.js CLI router
lib/scanner.js             Walks target directory — ranks, filters, detects binary
lib/batching.js            File selection + greedy batch packing within token budget
lib/profiler.js            5-question interactive setup → .byakugan/profile.json
lib/llm.js                 ALL LLM + embedding calls (Groq + HF) — single gateway
lib/analyzer.js            Multi-pass orchestration → analysis.json + embeddings.json
lib/reporter.js            Reads analysis.json + profile.json → self-contained HTML
lib/explain.js             Per-file explanation using analysis.json + LLM
lib/impact.js              Change-impact analysis using chakra network + LLM
lib/chat.js                Adaptive RAG chat loop
lib/spinner.js             Terminal spinner

templates/prompts/
  analyze_survey.md        Pass 1 — project-shape survey
  analyze_files.md         Pass 2..N — per-batch file analysis
  analyze_synthesize.md    Final pass — cross-file synthesis + quiz generation
  explain.md               Per-file explanation prompt
  impact.md                Change-impact analysis prompt
  chat.md                  RAG chat system prompt
  route.md                 Query routing prompt (SEARCH vs CHAT)

.byakugan/                 Runtime output — gitignored
  profile.json
  analysis.json
  embeddings.json
  report.html
```

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
  Budget: ~16 000 chars / batch (~5 300 tokens), well under Groq's free-tier limit.
        │
        ▼
  Pass 1 — Survey
  LLM reads the full file inventory + manifests (package.json, README, etc.)
  → project name, language, architecture, entry points, summary
        │
        ▼
  Pass 2..N — File batches
  LLM reads each batch → per-file purpose, exports, imports, techniques,
  hotspots, state mutations, module-graph edges, external dependencies
        │
        ▼
  Final pass — Synthesis
  LLM sees a cross-file digest of everything found so far
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
  embeds each chunk with HF bge-small-en-v1.5,
  saves embeddings.json for the RAG chat index.
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
  llm.routeQuery() → SEARCH or CHAT
        │
  SEARCH ──▶ llm.embed(question)
             cosine similarity vs all chunks in embeddings.json
             top-3 chunks retrieved
             │
             ▼
  buildSystemPrompt(template, { projectName, projectSummary, intent, level, context })
  Answer is adapted to your profile: Junior gets oriented, Senior gets tradeoffs
        │
        ▼
  llm.chat([system, ...10-turn history, user question])
        │
        ▼
  Answer printed — history updated
```

---

## Quick Start

```bash
# 1. Clone and install
git clone <your-repo-url>
cd byakugan
nvm use          # Node 20 required — see .nvmrc
npm ci

# 2. Configure environment
cp .env.example .env
# Open .env and fill in GROQ_API_KEY and HF_API_KEY (both free — see below)

# 3. (Optional) link binary globally
npm link

# 4. Verify setup
byakugan doctor

# 5. Run
byakugan profile                        # set your skill level + intent
byakugan analyze ./path/to/any/repo     # analyse a codebase
byakugan report                         # open .byakugan/report.html
byakugan explain lib/analyzer.js        # explain one file
byakugan impact lib/analyzer.js         # blast-radius analysis
byakugan chat                           # ask anything about the codebase
```

---

## Getting Your API Keys

Both keys are **free with no credit card required**.

| Key | Where to get it | What it's used for |
|---|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | LLM generation + query routing |
| `HF_API_KEY` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) — create a "Read" token | Chunk embeddings for RAG chat |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ | — | Groq API key |
| `HF_API_KEY` | ✅ | — | Hugging Face token |
| `LLM_MODEL` | — | `openai/gpt-oss-120b` | Override generation model |
| `EMBED_MODEL` | — | `BAAI/bge-small-en-v1.5` | Override embedding model |
| `LLM_TPM_LIMIT` | — | `8000` | Groq tokens/min budget (raise for paid tier) |
| `BATCH_CHAR_BUDGET` | — | `16000` | Characters per file-analysis batch |
| `LLM_MAX_COMPLETION_TOKENS` | — | `16000` | Output token ceiling per LLM call |
| `LLM_TIMEOUT_MS` | — | `120000` | Per-request timeout in ms |
| `LLM_MAX_ATTEMPTS` | — | `4` | Retries on 429/5xx errors |
| `MAX_FILES` | — | `800` | Hard ceiling on files sent to LLM |
| `MAX_CONTENT_CHARS` | — | `1500000` | Hard ceiling on total content characters |

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
Looks up the file in `analysis.json` and asks the LLM for a focused explanation: what the file does, its key exports, what depends on it, and anything non-obvious. Output adapted to your profile level.

### `byakugan impact <file> [-p project-path]`
Structured blast-radius analysis: direct dependents, second-order risk, state mutation risk, safe change zones, and a recommended approach. Uses the chakra network edges from `analysis.json`.

### `byakugan chat [--rag] [--no-rag] [--smart-route] [-p project-path]`
RAG-powered chat. Automatically uses full-context mode for small analyses and retrieval mode for large ones. `--smart-route` adds an LLM call to classify each question before retrieving. Keeps a rolling 10-turn history.

### `byakugan doctor`
Prints Node version, model config, and rate-limit settings, then makes a live probe call to both Groq and HF. Shows green ✓ or red ✗ for each.

---

## Project Structure

```
byakugan/
├── bin/
│   └── byakugan.js
├── lib/
│   ├── analyzer.js
│   ├── batching.js
│   ├── chat.js
│   ├── explain.js
│   ├── impact.js
│   ├── llm.js
│   ├── profiler.js
│   ├── reporter.js
│   ├── scanner.js
│   └── spinner.js
├── templates/
│   └── prompts/
│       ├── analyze_survey.md
│       ├── analyze_files.md
│       ├── analyze_synthesize.md
│       ├── chat.md
│       ├── explain.md
│       ├── impact.md
│       └── route.md
├── bob_session/
│   ├── images/              ← screenshots go here
│   ├── plan.md
│   └── session_notes.md
├── .env.example
├── .nvmrc
└── package.json
```

---

## Built for the IBM Bob 2.0 Hackathon

**Team:** Brenda & Naran

See [`bob_session/`](bob_session/) for the implementation plan and full session notes.

---

## License

MIT
