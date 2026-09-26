# Byakugan — Implementation Plan (Final)

## What Byakugan Does

Byakugan is a Node.js CLI that scans any codebase, sends it through a multi-pass LLM pipeline,
and produces an adaptive HTML report, per-file explanations, change-impact analysis, and a
RAG-powered chat assistant — all tailored to the user's skill level and intent.

The LLM is called **only during analysis** (`byakugan analyze`). The report, quiz, explain, and
impact commands read from the saved `analysis.json` file. The chat command uses RAG retrieval
against `embeddings.json`.

---

## Final Architecture

```
bin/byakugan.js            Commander.js CLI router — 7 commands
lib/scanner.js             Directory walker, file ranker, binary detector
lib/batching.js            File selection + greedy batch packing within token budget
lib/profiler.js            5-question interactive setup → .byakugan/profile.json
lib/llm.js                 ALL LLM + embedding calls (Groq + HF) — single gateway
lib/analyzer.js            Multi-pass orchestration → analysis.json + embeddings.json
lib/reporter.js            Reads analysis.json + profile.json → self-contained HTML
lib/explain.js             Per-file explanation using analysis.json + LLM
lib/impact.js              Change-impact analysis using chakra network + LLM
lib/chat.js                Adaptive RAG chat loop
lib/spinner.js             Terminal spinner utility

templates/prompts/
  analyze_survey.md        Pass 1 — project-shape survey
  analyze_files.md         Pass 2..N — per-batch file analysis
  analyze_synthesize.md    Final pass — cross-file synthesis + quiz generation
  explain.md               Per-file explanation prompt
  impact.md                Change-impact analysis prompt
  chat.md                  RAG chat system prompt
  route.md                 Query routing prompt (SEARCH vs CHAT)

.byakugan/                 Runtime output — gitignored
  profile.json             User profile
  analysis.json            Full LLM output — source of truth
  embeddings.json          Chunk vectors for RAG chat
  report.html              Generated report
  partial/                 Resume cache for interrupted analyze runs
```

---

## LLM Provider Decisions

| Concern | Provider | Model |
|---|---|---|
| Generation + routing | Groq (free tier) | `openai/gpt-oss-120b` (env: `LLM_MODEL`) |
| Embeddings | Hugging Face Inference API (free) | `BAAI/bge-small-en-v1.5` (env: `EMBED_MODEL`) |

Both called via Node's built-in `https` module — zero new npm dependencies.
`@ibm-cloud/watsonx-ai` and `@langchain/community` removed entirely.
Bob and watsonx are fully removed from the codebase.

---

## Environment Variables

```
GROQ_API_KEY                Required — Groq API key (https://console.groq.com)
HF_API_KEY                  Required — Hugging Face token (https://huggingface.co/settings/tokens)
LLM_MODEL                   Optional — defaults to openai/gpt-oss-120b
EMBED_MODEL                 Optional — defaults to BAAI/bge-small-en-v1.5
LLM_TPM_LIMIT               Optional — tokens/min budget for rate pacing (default 8000)
BATCH_CHAR_BUDGET           Optional — characters per file batch (default 16000)
LLM_MAX_COMPLETION_TOKENS   Optional — output token ceiling per call (default 16000)
LLM_TIMEOUT_MS              Optional — per-request timeout ms (default 120000)
LLM_MAX_ATTEMPTS            Optional — retries on 429/5xx (default 4)
MAX_FILES                   Optional — file ceiling for analyze (default 800)
MAX_CONTENT_CHARS           Optional — content char ceiling (default 1500000)
```

---

## Analysis Pipeline

```
byakugan analyze <path>
  1. scanner.scan()           walk + rank + filter files
  2. batching.selectFiles()   apply MAX_FILES / MAX_CONTENT_CHARS
  3. batching.packBatches()   greedy first-fit within BATCH_CHAR_BUDGET
  4. Pass 1 — survey          LLM reads inventory + manifests → project shape
  5. Pass 2..N — files        LLM reads each batch → techniques, files, edges
  6. Final pass — synthesis   LLM sees cross-file digest → hotspots, quiz, graph
  7. mergePasses()            deduplicate + merge all pass outputs
  8. normalizeAnalysis()      fill defaults, validate types
  9. analysis.json saved
 10. buildAndSaveEmbeddings() chunk → embed → embeddings.json
```

### Chunk types for embeddings

| id pattern | text content |
|---|---|
| `overview` | project name, description, summary, architecture |
| `file:{path}` | path, language, lines, complexity, purpose, exports |
| `technique:{name}` | name, category, what_it_is, why_it_matters |
| `hotspot:{file}` | file, reason, risk level |
| `dep:{name}` | package name, runtime/dev, used_in files |

---

## RAG Chat Design

```
Startup:
  load analysis.json
  load embeddings.json
  load profile.json
  decide mode: full-context (analysis fits budget) or retrieval

Per turn:
  (--smart-route) routeQuery() → SEARCH or CHAT
  SEARCH:
    embed(question)
    cosine similarity vs all chunks
    retrieve top-3 chunks
  build system prompt from chat.md template
    → {{PROJECT_NAME}}, {{PROJECT_SUMMARY}}, {{RETRIEVED_CHUNKS}}
    → LEVEL_GUIDANCE[profile.level]
    → INTENT_GUIDANCE[profile.intent]
  llm.chat([system, ...history, user])
  update history (max 10 turns / 20 messages)
```

Cosine similarity is pure JS — zero dependencies. Embeddings are stored L2-normalized
so similarity reduces to a dot product.

---

## Explain Command

`byakugan explain <file>`

Reads `analysis.json`, finds the file entry, pulls exports/imports/related chunks,
fills `templates/prompts/explain.md`, calls `llm.chat()`.

Output adapted to user's profile level:
- Junior: plain language, oriented to the bigger picture
- Senior/Lead: direct, technical, focused on coupling and risk

---

## Impact Command

`byakugan impact <file>`

Reads `analysis.json`, extracts chakra network edges (fan-in / fan-out), hotspot data,
state mutations for the file, fills `templates/prompts/impact.md`, calls `llm.chat()`.

Output sections: direct blast radius, indirect risk, state risk, safe change zones,
recommended approach.

---

## Resilience Features

- **Partial resume** — each analysis pass is saved to `.byakugan/partial/`. If `analyze`
  is interrupted, the next run skips completed passes.
- **Token pacing** — `lib/llm.js` mirrors Groq's rolling TPM window locally. Requests
  wait with a live countdown rather than collecting 429s.
- **Retry with backoff** — 429/5xx errors are retried up to `LLM_MAX_ATTEMPTS` times
  with exponential backoff. DNS failures are not retried.
- **Graceful degradation** — if embeddings fail, `report` and `analyze` still complete.
  Chat falls back to full-context mode.

---

## Guard Rails

- `lib/llm.js` is the ONLY file that calls Groq or HF. No exceptions.
- `reporter.js` never calls any LLM.
- All prompt text lives in `templates/prompts/*.md`. No inline strings in JS.
- CommonJS only (`require`/`module.exports`). No `import`/`export`.
- Chalk v4 pinned. Do not upgrade — v5 breaks `require()`.
- `.byakugan/` is gitignored. Never commit `analysis.json` or `embeddings.json`.

---

## Getting Started

```bash
cp .env.example .env
# fill in GROQ_API_KEY and HF_API_KEY

npm ci
npm link

byakugan doctor                        # verify setup
byakugan profile                       # set skill level + intent
byakugan analyze ./path/to/repo        # analyse a codebase
byakugan report                        # generate report.html
byakugan explain lib/analyzer.js       # explain one file
byakugan impact lib/analyzer.js        # blast-radius analysis
byakugan chat                          # RAG chat
```
