# Managed Agents Migration — TODO

## Export Service (Python PDF/DOCX)
- [ ] Deploy `export-service/` to Render (Flask app wrapping existing Python generators)
- [ ] Set `EXPORT_SERVICE_URL` in `api/wrangler.toml` with Render URL
- [ ] Redeploy Worker (`cd api && npx wrangler deploy`)
- [ ] Test PDF/Word export buttons on live site
- [ ] Handle fonts on Linux (Liberation Sans via `apt-get install fonts-liberation`)
- [ ] Remove in-browser JS export code (`exportOnePagerPdf.js`, `exportOnePagerDocx.js`) once Python service is live — or keep as offline fallback

## One Pager Polish
- [ ] Remove diagnostic `/api/pipeline/test` endpoint from `api/src/routes/pipeline.js`
- [ ] Clean up `public/managed-agent-report.json` (test artifact)
- [ ] Clean up `scripts/inject-cost-report.js` (test artifact)
- [ ] Test One Pager generation on a company that should FAIL (verify the agent says "move on")

## PSR (Primary Source Reader) Agents
- [x] annual-reader — 10-K + DEF 14A extraction with long-term promise tracking
- [x] quarterly-reader — 10-Q + transcript extraction with short-term promise tracking

## Pitch Deck Agent Prompts
- [x] business-analyst-pitchdeck — Sections 1 (Radar), 2 (Simple & Predictable)
- [x] competitor-evaluator-market-position-pitchdeck — Section 3 (Market Position) — Phase 1
- [x] competitor-evaluator-moats-pitchdeck — Section 4 (Barriers & Moats) — Phase 2, receives Section 3 output
- [x] financial-analyst-pitchdeck — Sections 5 (FCF), 7 (ROE/ROIC/Debt), 8 (Balance Sheet) — Phase 2, single agent
- [x] management-evaluator-pitchdeck — Section 6 (Management) — Phase 2
- [x] risk-analyst-pitchdeck — Section 9 (PEST Risks) — Phase 3
- [x] valuation-specialist-pitchdeck — Section 10 (Valuation) — Phase 3, capstone

## Pitch Deck Infrastructure
- [ ] Create Pitch Deck coordinator with callable_agents
- [ ] Wire Pitch Deck into Worker pipeline routes (multi-phase, needs DataPacket)
- [ ] Apply UX fixes from `agents-v2/UX-MIGRATION-LOG.md` (usePitchDeck hook, timer, stage pills)
- [ ] Add Pitch Deck PDF/DOCX to export service

## Thes1s MCP Server (Phase 2 — after prompts)
- [ ] Extract valuation calculators (MOS, PBT, Ten Cap, Equity Bond) from React into pure functions
- [ ] Port engine code (edgarFinancials, scoring, growth rates) to run server-side
- [ ] Build MCP server wrapping existing `/data/` endpoints + ported engines
- [ ] Register MCP server in Managed Agents Console + credential vault
- [ ] Add MCP tools to agent configs (valuation-specialist gets calculators, competitor-evaluator gets compare_companies, etc.)

## Full Story (Final Stage)
- [x] Create Full Story agent prompts (7 specialist agents + coordinator)
- [ ] Create Full Story agents in Console (get agent IDs)
- [ ] Update coordinator-fullstory callable_agents with real agent IDs
- [ ] Wire debate flow (sequential 4-step: bull → bear → rebuttal → judge)
- [ ] Apply UX fixes from migration log
- [ ] Add Full Story PDF/DOCX to export service
