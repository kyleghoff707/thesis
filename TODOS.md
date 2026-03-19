# TODOS

## P2 — Direct XBRL/iXBRL Instance Document Parsing

**What:** Parse XBRL instance documents directly from EDGAR filings for real-time financial data, bypassing the companyfacts API.

**Why:** The companyfacts API has a 24-72 hour delay after a filing. Morningstar gets data within hours because they parse filings directly. This also enables Layer 3 per-company adapters to read calculation/presentation linkbases from the same filing package.

**Pros:** Real-time data availability, full filing structure access, enables per-company adapter generation, eliminates SEC API lag.

**Cons:** iXBRL is inline HTML with embedded XBRL tags — parsing is non-trivial. The SEC is also transitioning filing formats (iXBRL becoming standard). Many edge cases with company-specific extensions. High engineering effort.

**Context:** Build AFTER the three-layer engine (Layers 1-3) is production-stable. Layer 3 adapter work will naturally lead into this since both require downloading filing packages from EDGAR. The companyfacts API is sufficient for a research tool (not a trading tool) — 24-72hr delay is acceptable.

**Effort:** XL (human: ~6-8 weeks) → with CC+gstack: L (~6-8 hours)

**Depends on:** Layer 3 (per-company filing adapters) being built and validated first.

**Source:** CEO Plan Review 2026-03-18 (Expansion #4, deferred)
