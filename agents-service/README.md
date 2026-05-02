# thes1s-agents

Fly.io-hosted TypeScript service that runs Thes1s investment-research agents
using Inngest for orchestration and Langfuse for observability.

For the full architecture context (routes, secrets, D1 schema, deferred work),
see the `## v3 Pipeline (Inngest + Fly + Direct Anthropic SDK)` section of
the project root `CLAUDE.md`. The migration plan is at
`gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md`.

## Layout

```
src/
├── server.ts                    Fastify entrypoint (/health, /api/inngest)
├── inngest/
│   ├── client.ts                Inngest client + event schemas
│   └── functions/
│       ├── index.ts             Function registry
│       ├── hello-world.ts       Plumbing-verification function
│       └── one-pager.ts         One Pager Inngest fn (3 steps + onFailure)
├── agents/
│   ├── one-pager.ts             Pure agent runner (no Inngest deps)
│   ├── prompts.ts               Loads agents-v2/<name>/prompt.md from disk
│   └── schemas/
│       ├── report-section.ts    ReportSectionSchema (Zod)
│       └── one-pager.ts         OnePagerOutputSchema (Zod)
├── lib/
│   ├── anthropic-client.ts      SDK wrapper: caching, forced tool-call, 4xx → NonRetriableError
│   ├── langfuse-client.ts       Langfuse client (flushAt: 1 — short-lived fns)
│   ├── worker-callback.ts       POST result back to Worker
│   └── env.ts                   Zod-validated env loader
└── types/                       Shared TS type defs
tests/
├── server.test.ts               /health smoke test
├── schemas/one-pager.test.ts    Zod schema tests
├── agents/one-pager.test.ts     Agent runner tests (mocked SDK)
├── agents/prompts.test.ts       Prompt loader tests
├── lib/anthropic-client.test.ts Wrapper tests (mocked SDK + 4xx/5xx branches)
└── integration/one-pager.test.ts End-to-end (real Anthropic, gated by RUN_INTEGRATION=1)
```

## Local development

1. Copy secrets into `.env`:
   ```
   cp .env.example .env
   # then fill values from project root .env.local
   ```
2. Install deps: `npm install`
3. Start Inngest dev server (in one terminal): `npm run inngest:dev`
4. Start the service (in another terminal): `npm run dev`
5. Hit health check: `curl http://localhost:3000/health`

## Deploy

Run from the project root (not from `agents-service/`) so the build context
includes `agents-v2/` which gets baked into the image:

```bash
fly deploy . --config agents-service/fly.toml
```

After deploy, Inngest auto-syncs on the next event. Force a sync immediately:

```bash
curl -X PUT https://thes1s-agents.fly.dev/api/inngest
```

Initial setup only — register the app once via dashboard:
1. https://app.inngest.com → Apps → Sync new app
2. URL: https://thes1s-agents.fly.dev/api/inngest

## Running the integration test (real Anthropic, ~$0.20–$1)

```bash
# from agents-service/, with .env populated
set -a && source .env && set +a
RUN_INTEGRATION=1 npm test -- tests/integration
```

The test runs `runOnePagerAgent({ ticker: 'AAPL' })` against real Anthropic and asserts
the output validates against `OnePagerOutputSchema`. Skipped when `RUN_INTEGRATION` is
unset.
