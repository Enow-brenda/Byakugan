# AGENTS.md — Ask mode

This file provides guidance to agents when working with code in this repository.

## Context for answering questions

- **Project is a scaffold** — `lib/*.js` files contain only stub comments; `bin/byakugan.js` only logs a greeting; `templates/` directories are empty. When asked "how does X work", explain the *intended* design from AGENTS.md, not from reading code.
- **Two separate AI integrations**: Bob (via `.bob/` tooling, only in `lib/analyzer.js`) and watsonx.ai (via `@ibm-cloud/watsonx-ai` in `lib/chat.js`). They serve different roles — Bob for one-shot analysis, watsonx for ongoing RAG chat.
- **`.byakugan/` is the runtime data directory** (gitignored). `profile.json` and `analysis.json` live here. Users who report missing data likely haven't run `byakugan analyze` yet.
- **Node version discrepancy**: `.nvmrc` says `20.20.2`; the old AGENTS.md said `20.11.0`. Trust `.nvmrc`.
- **`@langchain/community` is pinned at `^0.0.50`** — a very old pre-1.0 version. API shapes differ significantly from current LangChain docs.
