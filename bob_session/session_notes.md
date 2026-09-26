# Byakugan — Bob Session Notes

**Team:** Brenda & Naran
**Hackathon:** IBM Bob 2.0 Hackathon
**Project:** Byakugan — 360° adaptive code comprehension CLI

---

## What We Built

A Node.js CLI with 7 commands that gives any developer 360° vision into any codebase. The core
insight: understanding a codebase is not a one-size-fits-all problem. A junior doing onboarding
needs different information than a senior doing a dangerous refactor. Byakugan adapts everything —
the report, the chat answers, the explanations — to the user's declared skill level and intent.

---

## Key Decisions Made During the Session

### 1. Provider switch: Bob/watsonx → Groq + Hugging Face

**Decision:** Remove all Bob shell and watsonx calls. Route all LLM generation through Groq
(free tier, no credit card) and all embeddings through Hugging Face Inference API (free "Read" token).

**Rationale:** Both are free with zero friction to get started. Groq is significantly faster
than watsonx for generation. HF provides free embedding inference with the exact model shape
(L2-normalized vectors) needed for cosine RAG retrieval.

**Implementation:** `lib/llm.js` — a single gateway file. No other file touches Groq or HF.
Uses Node's built-in `https` module — zero new npm dependencies.

### 2. Multi-pass analysis instead of single-prompt

**Decision:** Split the analysis into three pass types: survey → file batches → synthesis.

**Rationale:** Groq's free tier has an 8,000 token/minute limit. A single prompt containing
an entire codebase would exceed both the per-request ceiling and the per-minute window.
Multi-pass with a 16,000 char / ~5,300 token batch budget keeps every request within the free
tier and adds partial-resume resilience.

**Implementation:** `lib/analyzer.js` + `lib/batching.js`. Each pass result is cached in
`.byakugan/partial/` so an interrupted run resumes from where it left off.

### 3. Adaptive output driven by profile

**Decision:** Every command output adapts to the user's `profile.json`.

**Rationale:** A Junior doing onboarding needs orientation ("what does this file do, where
do I start"). A Senior doing a dangerous modification needs blast-radius analysis ("what
breaks, what is the real coupling"). The same analysis JSON can serve both if the rendering
and prompts are profile-aware.

**Implementation:** `lib/profiler.js` saves 5 fields (name, intent, level, focus, notes).
`lib/reporter.js`, `lib/explain.js`, `lib/chat.js` all read this and adapt their output.

### 4. True RAG for chat, not context-stuffing

**Decision:** Implement real retrieval-augmented generation for the chat command.

**Rationale:** Stuffing the entire `analysis.json` into every chat turn hits token limits
for large codebases and sends irrelevant context on most questions. True RAG embeds the
analysis into semantic chunks, retrieves only the most relevant ones per question, and keeps
token cost per chat turn small and constant regardless of codebase size.

**Implementation:**
- `buildAndSaveEmbeddings()` in `analyzer.js` chunks `analysis.json` after every analyze run
- `embeddings.json` is saved alongside `analysis.json` in `.byakugan/`
- `lib/chat.js` uses cosine similarity (pure JS, no deps) to retrieve top-3 chunks per question
- Smart routing via `llm.routeQuery()` classifies conversational vs. technical questions
  (opt-in with `--smart-route` — off by default because retrieval is local and cheap)

### 5. Graceful degradation everywhere

**Decision:** Missing files prompt rather than crash. Partial failures skip rather than abort.

**Rationale:** The most common user error is running `chat` or `report` before `analyze`.
Crashing with a stack trace is the worst response. Prompting to run the prerequisite inline
keeps the workflow smooth.

**Implementation:**
- `byakugan chat` — if `analysis.json` missing: prompts for path to analyze first
- `byakugan chat` — if `profile.json` missing: asks "Run profile setup now? [Y/n]"
- `byakugan report` — if `analysis.json` missing: prompts for path to analyze first
- `byakugan report` — if `profile.json` missing: runs profiler automatically
- Embedding failures during `analyze` are caught per-batch; `analysis.json` is still saved

### 6. explain and impact commands

**Decision:** Add two focused commands beyond the report and chat.

**Rationale:** The report is a full document — not what you want when you need a quick
answer about one file. `explain` and `impact` are narrow, high-signal commands that answer
the two most common developer questions: "what does this do?" and "what breaks if I change it?"

**Implementation:**
- `lib/explain.js` — reads file entry from `analysis.json`, retrieves related chunks from
  `embeddings.json`, fills `templates/prompts/explain.md`, calls `llm.chat()`
- `lib/impact.js` — extracts chakra network edges (fan-in/fan-out), hotspot data, state
  mutations from `analysis.json`, fills `templates/prompts/impact.md`, calls `llm.chat()`

---

## Architecture Evolution

```
Initial scaffold (stubs only)
  ↓
Bob shell + watsonx single-prompt approach
  ↓
Decision: remove Bob/watsonx, move to Groq + HF
  ↓
Decision: multi-pass pipeline to fit Groq free-tier limits
  ↓
Add lib/llm.js as single LLM gateway
Add lib/batching.js for token-budget-aware file packing
  ↓
Add true RAG: embeddings.json built during analyze, cosine retrieval in chat
  ↓
Add lib/explain.js and lib/impact.js
Add templates/prompts/explain.md and impact.md
  ↓
Graceful degradation: chat + report offer to run prerequisites inline
  ↓
Strip all comments from lib files (developer preference)
  ↓
Update README, AGENTS.md, bob_session/ for hackathon submission
```

---

## Files Created / Changed

| File | Action |
|---|---|
| `lib/llm.js` | NEW — Groq generation + HF embeddings, token pacing, retry |
| `lib/batching.js` | NEW — file selection + greedy batch packing |
| `lib/analyzer.js` | Rewritten — multi-pass pipeline, embed step, partial resume |
| `lib/chat.js` | Rewritten — full RAG loop, adaptive prompts, smart routing |
| `lib/explain.js` | NEW — per-file LLM explanation |
| `lib/impact.js` | NEW — change-impact analysis |
| `lib/scanner.js` | Updated — binary detection, file ranking, head+tail truncation |
| `lib/reporter.js` | Updated — graceful analysis/profile fallbacks |
| `lib/profiler.js` | Updated — piped input support, graceful defaults |
| `templates/prompts/analyze_survey.md` | NEW — pass 1 prompt |
| `templates/prompts/analyze_files.md` | NEW — pass 2..N prompt |
| `templates/prompts/analyze_synthesize.md` | NEW — synthesis prompt |
| `templates/prompts/explain.md` | NEW — explain prompt |
| `templates/prompts/impact.md` | NEW — impact prompt |
| `templates/prompts/chat.md` | NEW — RAG chat system prompt |
| `templates/prompts/route.md` | NEW — query routing prompt |
| `bin/byakugan.js` | Updated — 7 commands registered |
| `.env.example` | Rewritten — Groq + HF vars, full documentation |
| `package.json` | Removed @ibm-cloud/watsonx-ai + @langchain/community |
| `AGENTS.MD` | Updated — reflects current architecture |
| `README.MD` | Rewritten — full documentation |

---

## What's Left / Future Work

- Add `byakugan quiz` as a standalone interactive command (quiz data is already in `analysis.json`)
- Stream LLM responses in chat for faster perceived response time
- Add `--watch` mode to `analyze` to re-run on file changes
- Support `.byakuganignore` negation patterns for fine-grained control
- Multi-language quiz difficulty calibration beyond the current 2 intent×level pairs
