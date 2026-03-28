# Phase 8: Core Agent Dispatch - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 08-core-agent-dispatch
**Areas discussed:** API client initialization, Agent dispatch interface, Web search URL extraction, Error handling & retry

---

## API Client Initialization

| Option | Description | Selected |
|--------|-------------|----------|
| Import before nodeAdapter | Create Anthropic client BEFORE nodeAdapter patches fetch. SDK captures original fetch at import time. | |
| Standalone dotenv (smoke test pattern) | Load .env.local via dotenv directly, never import nodeAdapter. Same as smoke test. | ✓ |
| You decide | Let Claude figure out cleanest approach. | |

**User's choice:** Standalone dotenv for now
**Notes:** User mentioned the app will eventually have a Cloudflare server to hide all API keys. This makes the current dotenv approach intentionally temporary — no need to over-engineer. Server migration replaces the entire client initialization strategy.

---

## Agent Dispatch Interface

### Return shape

| Option | Description | Selected |
|--------|-------------|----------|
| Section + cost + diagnostics | Return { section, usage, webSearches, model, duration }. Full PM visibility. | ✓ |
| Section + usage only | Minimal return. Diagnostics logged, not returned. | |
| You decide | Let Claude decide return shape. | |

**User's choice:** Section + cost + diagnostics

### Config resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Read at call time | Function reads config.json + prompt.md itself. Caller passes agent name. | |
| Pre-loaded by caller | Caller reads and passes everything. Engine is stateless. | |
| You decide | Let Claude decide. | ✓ |

**User's choice:** You decide

---

## Web Search URL Extraction

| Option | Description | Selected |
|--------|-------------|----------|
| Post-process: match URLs to citations by content | Scan tool results, match to citations by text similarity. | |
| Trust agent's citation.url field | Agent populates url via structured output. Post-process fills gaps. | |
| Both: agent fills + post-process backfills | Belt-and-suspenders approach. | |
| You decide | Let Claude decide extraction strategy. | ✓ |

**User's choice:** You decide

---

## Error Handling & Retry

| Option | Description | Selected |
|--------|-------------|----------|
| Return null + error details | Failed agent returns null section + error object. Caller decides. | |
| Return partial if available | Extract truncated response if possible. Null only on total failure. | |
| You decide | Let Claude decide failure behavior. | ✓ |

**User's choice:** You decide

---

## Claude's Discretion

- Agent config resolution (read at call time vs pre-loaded)
- Web search URL extraction strategy
- Error handling: partial vs null on failure, retry count, backoff strategy
- max_tokens per agent
- Prompt assembly structure (system message layout)

## Deferred Ideas

- Cloudflare server layer (moves API keys server-side)
- Prompt caching (API-03, likely Phase 9)
- In-browser direct API calls (EXPT-06)
- Streaming progress UI
