# Byakugan — Implementation Plan

## What Byakugan Does

Byakugan is a Node.js CLI that scans any codebase, sends it to an LLM for deep structured
analysis, and generates an adaptive HTML report. The report, quiz, and chat features are all
driven from a single saved `analysis.json` file — the LLM is never called during report
rendering or quiz display.

---

## Architecture

```
bin/byakugan.js          Commander.js CLI router
lib/scanner.js           Walks target directory → structured file list
lib/profiler.js          5 questions → .byakugan/profile.json
lib/llm.js               ALL LLM + embedding calls (Groq + HF) — single source of truth
lib/analyzer.js          Orchestrates: scan → prompt → llm.generate → embed → save
lib/reporter.js          Reads analysis.json + profile.json → static HTML report
lib/chat.js              RAG chat loop: route → retrieve → answer
templates/prompts/       All prompt files (never inline prompt strings in JS)
  analyze.md             One-shot analysis prompt (used by analyzer.js)
  route.md               Query routing prompt (used by chat.js via llm.routeQuery)
  chat.md                RAG chat system prompt template (used by chat.js)
.byakugan/               Runtime output — gitignored
  profile.json           User profiler output
  analysis.json          LLM analysis output
  embeddings.json        Chunk vectors — built during analyze, loaded by chat
```

---

## LLM Provider Decisions

| Concern        | Provider                              | Model                                    |
|----------------|---------------------------------------|------------------------------------------|
| Generation     | Groq (free tier)                      | `llama-3.3-70b-versatile` (overridable)  |
| Embeddings     | Hugging Face Inference API (free)     | `sentence-transformers/all-MiniLM-L6-v2` |

Both are called via plain `axios` (already a transitive dependency — no new install needed).
`@ibm-cloud/watsonx-ai` and `@langchain/community` are removed entirely.

---

## Environment Variables

```
GROQ_API_KEY          Required. Groq API key (https://console.groq.com)
HF_API_KEY            Required for RAG. Hugging Face token (https://huggingface.co/settings/tokens)
LLM_MODEL             Optional. Defaults to llama-3.3-70b-versatile
EMBED_MODEL           Optional. Defaults to sentence-transformers/all-MiniLM-L6-v2
```

---

## lib/llm.js — The LLM Gateway

Single file that owns every LLM/embedding call. No other file touches Groq or HF directly.

### Exports

```js
generate(promptText)      // one-shot text generation — for analyzer
embed(text)               // embed a string → number[] — for RAG indexing + querying
chat(messages)            // multi-turn chat — for chat loop
routeQuery(question)      // classify question → 'SEARCH' | 'CHAT'
```

### Internal design

```
groq client   — axios instance, baseURL https://api.groq.com/openai/v1
hf embed      — plain axios POST per call (stateless)

generate(prompt)
  POST /chat/completions
  messages: [{ role: 'user', content: prompt }]
  max_tokens: 8192, temperature: 0
  returns: response.data.choices[0].message.content

embed(text)
  POST https://api-inference.huggingface.co/pipeline/feature-extraction/{EMBED_MODEL}
  body: { inputs: text }
  returns: number[]  (the embedding vector)

chat(messages)
  POST /chat/completions
  messages: (passed in as-is)
  max_tokens: 1024, temperature: 0.3
  returns: response.data.choices[0].message.content

routeQuery(question)
  reads templates/prompts/route.md
  replaces {{QUESTION}} placeholder
  calls generate(filledPrompt)
  parses response: if it contains 'SEARCH' → 'SEARCH', else → 'CHAT'
```

---

## lib/analyzer.js — Analysis Orchestration

```
1. validatePath(targetPath)
2. scanner.scan(targetPath)          → scanResult
3. buildPrompt(scanResult)           → reads analyze.md, fills {{SOURCE_PATH}} + {{SCANNED_DATA}}
4. llm.generate(prompt)              → raw JSON string
5. parseAndValidate(raw)             → analysis object
6. saveAnalysis(analysis)            → .byakugan/analysis.json
7. buildAndSaveEmbeddings(analysis)  → .byakugan/embeddings.json  (NEW)
```

### Step 7 — buildAndSaveEmbeddings

Chunks analysis.json into semantically meaningful pieces, embeds each one, saves vectors.

**Chunk types:**

| id pattern         | text content                                              |
|--------------------|-----------------------------------------------------------|
| `overview`         | project name + description + summary + architecture       |
| `file:{path}`      | path + language + lines + purpose + export names          |
| `technique:{name}` | name + category + what_it_is + why_it_matters             |
| `hotspot:{file}`   | file + reason + risk level                                |
| `dep:{name}`       | package name + runtime/dev + used_in files                |

Each chunk is embedded via `llm.embed()` then stored as:
```json
{ "id": "file:lib/chat.js", "text": "...", "vector": [0.12, -0.34, ...] }
```

Full array saved to `.byakugan/embeddings.json`.

---

## lib/chat.js — True RAG Chat Loop

### Startup

1. Load `.byakugan/analysis.json`
2. Load `.byakugan/embeddings.json`
3. Build watsonx-free context string (project name/summary only — used for CHAT-mode fallback)

### Per-turn flow

```
user question
    │
    ▼
llm.routeQuery(question)
    │
    ├─ 'CHAT' ──→ llm.chat([system_prompt, ...history, user_turn])
    │              (no retrieval — answer from history + project summary)
    │
    └─ 'SEARCH' ─→ llm.embed(question)
                    │
                    ▼
                cosine similarity vs every chunk in embeddings.json
                    │
                    ▼
                top 3 chunks by score
                    │
                    ▼
                build messages:
                  [system_prompt_with_chunks, ...history, user_turn]
                    │
                    ▼
                llm.chat(messages)
```

### Cosine similarity — pure JS, zero deps

```js
function cosine(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}
```

### History management

- Keep last 10 turns (20 messages) in memory
- Trim oldest pair when limit exceeded

---

## templates/prompts/ — All Prompt Files

### analyze.md (existing — no change to schema)
Used by `lib/analyzer.js`. Placeholders: `{{SOURCE_PATH}}`, `{{SCANNED_DATA}}`.

### route.md (new)
Used by `lib/llm.js → routeQuery()`. Placeholder: `{{QUESTION}}`.
Instructs the model to reply with exactly one word: `SEARCH` or `CHAT`.

### chat.md (new)
Used by `lib/chat.js` to build the system prompt for the chat loop.
Placeholders: `{{PROJECT_NAME}}`, `{{PROJECT_SUMMARY}}`, `{{RETRIEVED_CHUNKS}}`.

---

## Hard Constraints (from AGENTS.md)

- CommonJS only (`require`/`module.exports`) — no `import`/`export`
- `llm.js` is the ONLY file that makes external HTTP calls to Groq or HF
- No inline prompt strings in JS — all prompt text lives in `templates/prompts/*.md`
- No Bob calls anywhere
- No watsonx calls anywhere
- `reporter.js` never calls any LLM — reads `analysis.json` only
- `.byakugan/` is gitignored — never commit `analysis.json` or `embeddings.json`
- No new npm dependencies without approval (`axios` is already available as a transitive dep)

---

## Files Changed

| File                        | Action                                              |
|-----------------------------|-----------------------------------------------------|
| `lib/llm.js`                | NEW — Groq generation + HF embeddings               |
| `lib/analyzer.js`           | Remove watsonx/bob code, add embed step             |
| `lib/chat.js`               | Full RAG loop replacing context-stuffing            |
| `templates/prompts/route.md`| NEW — query routing prompt                          |
| `templates/prompts/chat.md` | NEW — RAG chat system prompt                        |
| `.env.example`              | Replace watsonx/bob vars with GROQ + HF vars        |
| `package.json`              | Remove @ibm-cloud/watsonx-ai + @langchain/community |

---

## Getting Started

```bash
cp .env.example .env
# fill in GROQ_API_KEY and HF_API_KEY

npm ci
npm link                          # exposes `byakugan` binary globally

byakugan profile                  # answer 5 questions → profile.json
byakugan analyze ./path/to/repo   # scan + LLM analysis + embed → analysis.json + embeddings.json
byakugan report                   # generate report.html
byakugan chat                     # RAG chat session
```
