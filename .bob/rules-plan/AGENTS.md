# AGENTS.md — Plan mode

This file provides guidance to agents when working with code in this repository.

## Architectural constraints to respect when planning

- **Bob runs exactly once** per `byakugan analyze` invocation. All other commands (`explain`, `impact`, `chat`, `report`) must read from the saved `.byakugan/analysis.json`. Plans that involve calling Bob at report or chat time violate the core design.
- **Report is a static HTML file** — no server, no dynamic rendering. Plans requiring a local HTTP server or live Bob calls for report UI are out of scope.
- **`analysis.json` schema is not yet defined** — any plan that touches multi-command data flow must first define and agree on that schema, as every command depends on it.
- **Prompt files (`templates/prompts/*.md`) are the contract** between the JS code and Bob. Changes to analysis behavior must update the prompt file, not inline JS strings.
- **`@langchain/community@^0.0.50`** is the RAG layer. Plans using LangChain must account for the pre-1.0 API (e.g., `VectorStore`, `RetrievalQAChain` class-based API, not the newer LCEL pipe syntax).
- **No dependency additions without approval** — plans must flag any new `npm` packages as requiring sign-off before implementation.
- **Single binary, no sub-processes** — the CLI is a single Node process. Plans involving spawning child processes or a separate HTTP server need explicit justification.
