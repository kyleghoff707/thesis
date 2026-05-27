# Changelog

All notable changes to Thesis are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-10

Initial public release.

### Added
- `/analyze TICKER` Claude Code skill — runs the three-stage gated pipeline (One Pager → Pitch Deck → Final Thesis).
- One Pager stage — single-agent quick screen with pass/fail verdict.
- Pitch Deck stage — 10-section research case across 5 parallel waves, covering compounding, capital efficiency, capital allocation, resilience, and valuation.
- Final Thesis stage — 7 agents with bull/bear adversarial debate, ending in a verdict box + trade plan.
- Thesis Score — 4-pillar Buffett-flavored rubric (Compounding / Capital Efficiency / Capital Allocation / Resilience).
- Local engines for SEC EDGAR (10-K, 10-Q, DEF 14A, Form 4, Form 13F) and Yahoo Finance (prices, estimates, peers).
- Bundled earnings transcripts — ~1,677 markdown files covering ~492 of the S&P 500 (~72 MB in `./transcripts/`).
- PDF + DOCX + JSON report renderers under `scripts/pdf/`.
- Cross-platform home directory at `~/thesis/` with ticker-safe filename helpers.
- Optional Alpha Vantage fallback for missing transcripts (bring your own free key).
- MIT license, Contributor Covenant 2.1, issue templates, PR template.

### Notes
- Standalone CLI only in this release. Connected-mode website sync (`thesis-investing.com` account push) is planned but not yet wired.
- Pitch Deck dispatches 10 subagents in parallel — Claude Code **Max** subscription strongly recommended. Pro will throttle.
- Tested on macOS and Linux. Windows is additive — please file issues.
