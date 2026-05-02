# Thes1s Agent Pipeline Migration — Phase 1 Implementation Plan
## Infrastructure + One Pager POC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new agent service stack (Fly.io + Inngest + Langfuse + Anthropic SDK direct) and migrate the One Pager pipeline as a working proof of concept. This validates the architecture end-to-end before tackling Pitch Deck (10 agents, 5 waves) and Full Story (7 agents, debate flow) in subsequent plans.

**Architecture:** Cloudflare Worker stays as the front door (auth, D1/R2, DataPacket assembly). New Fastify TypeScript service on Fly.io hosts Inngest functions. When a run starts: Worker fires an Inngest event → Inngest Cloud queues + dispatches to Fly → Fly calls Anthropic with direct SDK using forced tool-call output + prompt caching → Langfuse traces every call → Fly POSTs result back to Worker → Worker writes to D1. Frontend polls Worker for status. Existing Managed Agents pipeline (v1) stays running in parallel; new pipeline lives at `/api/v3/*` routes behind a feature flag for safe cutover.

**Tech Stack:** TypeScript, Node.js 22 LTS, Fastify, Inngest SDK with Fastify adapter, Anthropic SDK (`@anthropic-ai/sdk`), Langfuse SDK, Zod schemas, Vitest tests. No agent framework — direct SDK calls inside `step.run()` blocks for full control over prompt caching, tool definitions, and structured output.

---

## Plain-English Overview (for the PM)

Today, when you click "Generate One Pager" in the app:
1. The Worker creates a Managed Agents session via the Anthropic beta API
2. The agent runs on Anthropic's servers, doing web search and writing the report
3. The Worker polls Anthropic for status, eventually saves the result to D1
4. **You can't do multi-agent because Anthropic hasn't granted `callable_agents` access**

After this Phase 1 plan, when you click "Generate One Pager":
1. The Worker fires an event called `thes1s/onepager.start` to Inngest
2. Inngest queues the event and calls the new Fly service to run it
3. The Fly service calls Anthropic directly (using the Anthropic SDK) to do the One Pager work
4. Inngest **journals every step** — if anything crashes, it picks up where it left off, automatically retries failed steps, and never loses progress
5. **Langfuse captures every call** so you can see exactly what every agent did, what it cost, and how long it took
6. The Fly service POSTs the finished report to a new Worker endpoint, which writes to D1
7. The frontend polls D1 same as today — no UI changes for the user

The new architecture is **portable** (you can move off Cloudflare or off Fly without rewriting the agents) and **multi-agent ready** (Pitch Deck and Full Story will use the same plumbing in Phase 2 and Phase 3 plans).

This plan is designed so that **once the One Pager works through this stack, scaling to Pitch Deck = adding more `step.run()` calls** in the same pattern. There's no "phase 2 architecture decision" later — this plan locks in the architecture.

---

## Architecture Diagram

```
[ Frontend (Cloudflare Pages) ]
              │
              │ POST /api/v3/pipeline/onepager/start  {ticker}
              ▼
┌─────────────────────────────────────────┐
│ Cloudflare Worker (api.thes1sinvesting) │
│  - auth, D1/R2, DataPacket assembly     │
│  - NEW: v3 routes (start, status,       │
│    callback)                            │
└─────────────────────────────────────────┘
              │
              │ inngest.send({name: "thes1s/onepager.start", data: {...}})
              ▼
┌─────────────────────────────────────────┐
│ Inngest Cloud (orchestration layer)     │
│  - queues events                        │
│  - durable retries + journaling         │
│  - dispatches to Fly /api/inngest       │
└─────────────────────────────────────────┘
              │
              │ POST https://thes1s-agents.fly.dev/api/inngest
              ▼
┌─────────────────────────────────────────┐
│ Fly.io: thes1s-agents service           │
│  Fastify + Inngest functions:           │
│   step 1: load prompt                   │
│   step 2: call Anthropic                │
│   step 3: validate output (Zod)         │
│   step 4: POST result to Worker         │
│  Anthropic SDK direct (no framework)    │
│  Langfuse instrumented                  │
└─────────────────────────────────────────┘
              │                            │
              │ Anthropic API              │ Langfuse Cloud
              │ (Claude calls)             │ (trace events)
              ▼                            ▼
        [ Claude ]                    [ thes1s-dev ]
                                      [ project ]
              │
              │ POST /api/v3/pipeline/callback  {runId, result}
              ▼
       [ Worker writes to D1 ]
              │
              │ frontend polls /api/v3/pipeline/status/:runId
              ▼
       [ Result rendered ]
```

---

## File Structure

### New: `agents-service/` (Fly.io app)

```
agents-service/
├── package.json                          # deps + scripts
├── tsconfig.json                         # strict TS config
├── fly.toml                              # Fly app config (IAD region)
├── Dockerfile                            # Node 22 slim + production build
├── .env.example                          # secret names only, no values
├── .gitignore                            # node_modules, dist, .env*
├── README.md                             # how to run locally + deploy
├── src/
│   ├── server.ts                         # Fastify entrypoint, /health, /api/inngest
│   ├── inngest/
│   │   ├── client.ts                     # Inngest client + event types
│   │   └── functions/
│   │       ├── index.ts                  # function registry
│   │       └── one-pager.ts              # One Pager Inngest function
│   ├── agents/
│   │   ├── one-pager.ts                  # core One Pager runner (no Inngest deps)
│   │   ├── prompts.ts                    # loads agents-v2/*/prompt.md from disk
│   │   └── schemas/
│   │       ├── report-section.ts         # ReportSectionSchema (Zod)
│   │       └── one-pager.ts              # OnePagerOutputSchema (Zod)
│   ├── lib/
│   │   ├── anthropic-client.ts           # SDK wrapper: caching, tool-call output, retry
│   │   ├── langfuse-client.ts            # Langfuse client + helpers
│   │   ├── worker-callback.ts            # POST result back to Worker
│   │   └── env.ts                        # typed env var loader (Zod-validated)
│   └── types/
│       └── one-pager.ts                  # shared type defs
└── tests/
    ├── schemas/one-pager.test.ts         # Zod schema unit tests
    ├── lib/anthropic-client.test.ts      # SDK wrapper unit tests (mocked)
    └── integration/one-pager.test.ts     # full agent run, real Anthropic, gated by env flag
```

### Modified: `api/` (Worker)

```
api/
├── wrangler.toml                         # add INNGEST_EVENT_KEY secret + V3_CALLBACK_SECRET var
├── schema.sql                            # add v3_runs table
├── src/
│   └── routes/
│       └── pipeline-v3.js                # NEW: v3 route handler
│   └── index.js                          # MODIFIED: register v3 routes
```

### Modified: `src/` (frontend)

```
src/
├── hooks/
│   └── useOnePagerV3.js                  # NEW: hook for v3 pipeline (parallel to existing)
├── components/
│   └── OnePagerStartButton.jsx           # MODIFIED: feature-flag toggle between v1 and v3
└── config.js                             # add USE_V3_ONEPAGER feature flag
```

---

# PHASE A — Fly.io + Inngest + Langfuse Infrastructure (Tasks 1–10)

**Phase A goal:** A deployed Fly service that Inngest Cloud can reach, with one trivial "hello world" Inngest function that writes a Langfuse trace. No agent logic yet. This proves the plumbing works end-to-end before we layer Anthropic on top.

**Phase A success criteria:** You can fire an event from your terminal (`curl` or `inngest send`), see it execute in the Inngest dashboard, see a trace appear in the Langfuse dashboard, and see the function return success. If this works, every Anthropic call we add later just slots in.

---

### Task 1: Scaffold the agents-service directory

**Files:**
- Create: `agents-service/package.json`
- Create: `agents-service/tsconfig.json`
- Create: `agents-service/.gitignore`
- Create: `agents-service/.env.example`
- Create: `agents-service/README.md`

- [ ] **Step 1: Create the directory and initialize package.json**

```bash
mkdir -p agents-service/src/{inngest/functions,agents/schemas,lib,types}
mkdir -p agents-service/tests/{schemas,lib,integration}
cd agents-service
```

Create `agents-service/package.json`:
```json
{
  "name": "thes1s-agents",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run tests/integration",
    "typecheck": "tsc --noEmit",
    "inngest:dev": "npx inngest-cli@latest dev"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",
    "fastify": "^5.0.0",
    "inngest": "^3.30.0",
    "langfuse": "^3.30.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `agents-service/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .gitignore and .env.example**

Create `agents-service/.gitignore`:
```
node_modules
dist
.env
.env.local
.env.*.local
*.log
.DS_Store
```

Create `agents-service/.env.example` (no real values — variable names only):
```
# Anthropic API key (separate from Worker; named in main .env.local as ANTHROPIC_API_KEY_AGENTS)
ANTHROPIC_API_KEY=

# Inngest (for receiving webhook calls from Inngest Cloud)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Langfuse (US region)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://us.cloud.langfuse.com

# Worker callback (used to POST results back to thes1s-api)
WORKER_CALLBACK_URL=https://api.thes1sinvesting.com
WORKER_CALLBACK_SECRET=

# Server config
PORT=3000
NODE_ENV=production
```

- [ ] **Step 4: Create README**

Create `agents-service/README.md`:
```markdown
# thes1s-agents

Fly.io-hosted TypeScript service that runs Thes1s investment-research agents
using Inngest for orchestration and Langfuse for observability.

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

```bash
fly deploy
```

After deploy, sync with Inngest:
1. Go to https://app.inngest.com → Apps → Sync new app
2. URL: https://thes1s-agents.fly.dev/api/inngest
```

- [ ] **Step 5: Install dependencies**

```bash
cd agents-service && npm install
```

Expected: `node_modules/` populates, no errors. If any peer-dep warnings appear they're fine.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd agents-service && npx tsc --noEmit
```

Expected: no output (success). If errors, the tsconfig is wrong — fix before proceeding.

- [ ] **Step 7: Commit**

```bash
git add agents-service/
git commit -m "feat: scaffold agents-service for Fly.io migration"
```

---

### Task 2: Fastify server with /health endpoint

**Files:**
- Create: `agents-service/src/server.ts`
- Create: `agents-service/src/lib/env.ts`
- Test: `agents-service/tests/server.test.ts` (smoke only — comprehensive tests come later)

**Why this matters:** Fastify is the HTTP server. `/health` is what Fly uses to know your container is alive. Get this working before anything else — if `/health` fails, nothing else can work.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/server.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';

describe('server', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('/health returns 200 with status ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd agents-service && npm test
```

Expected: FAIL with "Cannot find module '../src/server.js'".

- [ ] **Step 3: Create env loader**

Create `agents-service/src/lib/env.ts`:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  ANTHROPIC_API_KEY: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),
  LANGFUSE_PUBLIC_KEY: z.string().min(1),
  LANGFUSE_SECRET_KEY: z.string().min(1),
  LANGFUSE_HOST: z.string().url(),
  WORKER_CALLBACK_URL: z.string().url(),
  WORKER_CALLBACK_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }
  cached = parsed.data;
  return cached;
}
```

- [ ] **Step 4: Create the server**

Create `agents-service/src/server.ts`:
```typescript
import Fastify, { FastifyInstance } from 'fastify';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}

// Only start the server when this file is run directly (not when imported in tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await buildServer();
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`agents-service listening on :${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
cd agents-service && npm test
```

Expected: PASS — 1 test, 1 passing.

- [ ] **Step 6: Commit**

```bash
git add agents-service/src/server.ts agents-service/src/lib/env.ts agents-service/tests/server.test.ts
git commit -m "feat: Fastify server with /health endpoint and env validation"
```

---

### Task 3: Initialize Fly.io app

**Files:**
- Create: `agents-service/fly.toml`
- Create: `agents-service/Dockerfile`

**Why this matters:** Fly needs a `fly.toml` to know how to run your app and a `Dockerfile` to build the container. We're matching `thes1s-export`'s region (IAD) so the agent service is co-located.

- [ ] **Step 1: Create the Dockerfile**

Create `agents-service/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Copy the agents-v2 prompts at build time (we read from disk at runtime)
COPY --from=builder /app/dist ./dist

# Fly will inject PORT=3000 by default
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Note about prompt files:** The agents need to read `agents-v2/one-pager/prompt.md` at runtime, but that file lives in the parent repo, outside `agents-service/`. We will handle this in Task 11 by copying prompts during the Docker build. For now, the Dockerfile just sets up the Node service.

- [ ] **Step 2: Initialize the Fly app (no deploy yet)**

```bash
cd agents-service
fly launch --name thes1s-agents --region iad --no-deploy --copy-config=false
```

When prompted:
- "Would you like to copy its configuration to the new app?" → No
- "Would you like to set up a Postgres database now?" → No
- "Would you like to set up an Upstash Redis database?" → No
- "Would you like to deploy now?" → No

This creates a `fly.toml` in the current directory.

- [ ] **Step 3: Replace the generated fly.toml with our config**

Create/overwrite `agents-service/fly.toml`:
```toml
app = "thes1s-agents"
primary_region = "iad"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

**Note:** `auto_stop_machines = "stop"` and `min_machines_running = 0` means Fly will spin down the machine when idle — you only pay when agents are running. Cold start is ~3 seconds, acceptable for our use case.

- [ ] **Step 4: Build and test the Docker image locally**

```bash
cd agents-service
docker build -t thes1s-agents:local .
docker run --rm -p 3000:3000 \
  -e ANTHROPIC_API_KEY=test \
  -e INNGEST_EVENT_KEY=test \
  -e INNGEST_SIGNING_KEY=test \
  -e LANGFUSE_PUBLIC_KEY=test \
  -e LANGFUSE_SECRET_KEY=test \
  -e LANGFUSE_HOST=https://us.cloud.langfuse.com \
  -e WORKER_CALLBACK_URL=https://api.thes1sinvesting.com \
  -e WORKER_CALLBACK_SECRET=test \
  thes1s-agents:local
```

In another terminal: `curl http://localhost:3000/health` — expected `{"status":"ok"}`.

Stop the container with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add agents-service/Dockerfile agents-service/fly.toml
git commit -m "feat: Fly.io deployment config (IAD region, auto-stop)"
```

---

### Task 4: Set Fly secrets (USER ACTION REQUIRED)

**Files:** None (this task only sets cloud-side secrets)

**Why this matters:** Fly secrets are environment variables stored encrypted on Fly's side. They're injected into the running container. **The user runs these commands themselves so the secret values never enter Claude's view.**

- [ ] **Step 1: Open `.env.local` in the editor and find these values**

Open `/Users/kylehoff/Desktop/stock-analyzer/.env.local`. Identify the values for:
- `ANTHROPIC_API_KEY_AGENTS`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`

You'll also need to invent a value for `WORKER_CALLBACK_SECRET` — generate a random string with:
```bash
openssl rand -hex 32
```
Save this random string somewhere safe — you'll need to set it on the Worker side too in Task 17.

- [ ] **Step 2: Set Fly secrets one at a time**

Run each command in your terminal. **Replace `<paste-value-here>` with the actual value from `.env.local`.** (Tip: paste each value into a temporary plain-text editor first so you can verify there are no extra spaces or newline characters before running the command.)

```bash
fly secrets set --app thes1s-agents ANTHROPIC_API_KEY=<paste-value-here>
fly secrets set --app thes1s-agents INNGEST_EVENT_KEY=<paste-value-here>
fly secrets set --app thes1s-agents INNGEST_SIGNING_KEY=<paste-value-here>
fly secrets set --app thes1s-agents LANGFUSE_PUBLIC_KEY=<paste-value-here>
fly secrets set --app thes1s-agents LANGFUSE_SECRET_KEY=<paste-value-here>
fly secrets set --app thes1s-agents LANGFUSE_HOST=https://us.cloud.langfuse.com
fly secrets set --app thes1s-agents WORKER_CALLBACK_URL=https://api.thes1sinvesting.com
fly secrets set --app thes1s-agents WORKER_CALLBACK_SECRET=<paste-the-random-string-you-generated>
```

- [ ] **Step 3: Verify secrets are set (without revealing values)**

```bash
fly secrets list --app thes1s-agents
```

Expected output: a list of 8 secret names (no values shown), each with a recent "Updated at" timestamp.

- [ ] **Step 4: Initial deploy (without functions yet — health check only)**

```bash
cd agents-service && fly deploy
```

Expected: Fly builds the Docker image, deploys it, runs a health check. Success message ends with "v1 deployed successfully".

- [ ] **Step 5: Verify the public health endpoint**

```bash
curl https://thes1s-agents.fly.dev/health
```

Expected: `{"status":"ok"}`.

- [ ] **Step 6: Nothing to commit (cloud-side state changes only). Continue to Task 5.**

---

### Task 5: Wire Inngest client to Fastify

**Files:**
- Create: `agents-service/src/inngest/client.ts`
- Create: `agents-service/src/inngest/functions/index.ts`
- Modify: `agents-service/src/server.ts`

**Why this matters:** Inngest needs an HTTP endpoint on your service so it can dispatch function calls. The Inngest Fastify adapter wires this up — exposes `/api/inngest` which Inngest Cloud will POST to.

- [ ] **Step 1: Create the Inngest client**

Create `agents-service/src/inngest/client.ts`:
```typescript
import { Inngest, EventSchemas } from 'inngest';

// Define event types so TS knows the shape of event.data in functions
type Events = {
  'thes1s/onepager.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
    };
  };
  'thes1s/hello.world': {
    data: { message: string };
  };
};

export const inngest = new Inngest({
  id: 'thes1s-agents',
  schemas: new EventSchemas().fromRecord<Events>(),
});
```

- [ ] **Step 2: Create the function registry (empty for now)**

Create `agents-service/src/inngest/functions/index.ts`:
```typescript
// Functions are registered here so they all serve from /api/inngest.
// Imports will be added as functions are created (hello-world in Task 6, one-pager in Task 15).
export const functions: Array<unknown> = [];
```

- [ ] **Step 3: Update Fastify to serve the Inngest endpoint**

Replace `agents-service/src/server.ts` contents with:
```typescript
import Fastify, { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions/index.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  server.get('/health', async () => ({ status: 'ok' }));

  // Inngest serves at /api/inngest (Inngest Cloud calls this URL)
  await server.register(serve as never, {
    client: inngest,
    functions: functions as never,
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await buildServer();
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`agents-service listening on :${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
```

**Note:** The `as never` casts work around an Inngest type quirk where the Fastify adapter is loosely typed. They're safe here.

- [ ] **Step 4: Run tests to confirm /health still works**

```bash
cd agents-service && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-service/src/inngest agents-service/src/server.ts
git commit -m "feat: register Inngest endpoint at /api/inngest"
```

---

### Task 6: Add a hello-world Inngest function

**Files:**
- Create: `agents-service/src/inngest/functions/hello-world.ts`
- Modify: `agents-service/src/inngest/functions/index.ts`

**Why this matters:** Before adding any agent logic, we want to prove that Inngest Cloud can reach Fly, dispatch a function, and the function can complete. If this trivial function works, the plumbing is correct. If it doesn't, we'd never know whether the agent or the plumbing was broken.

- [ ] **Step 1: Create the hello-world function**

Create `agents-service/src/inngest/functions/hello-world.ts`:
```typescript
import { inngest } from '../client.js';

export const helloWorld = inngest.createFunction(
  { id: 'hello-world' },
  { event: 'thes1s/hello.world' },
  async ({ event, step }) => {
    const greeting = await step.run('compose-greeting', async () => {
      return `Hello, ${event.data.message}!`;
    });

    const wait = await step.run('compute-wait-ms', async () => {
      // Demonstrates a second step — Inngest journals each step independently.
      return 100;
    });

    return { greeting, waitedMs: wait };
  }
);
```

- [ ] **Step 2: Register the function**

Replace `agents-service/src/inngest/functions/index.ts` contents:
```typescript
import { helloWorld } from './hello-world.js';

export const functions = [helloWorld] as const;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd agents-service && npm run typecheck
```

Expected: no output (success).

- [ ] **Step 4: Run tests**

```bash
cd agents-service && npm test
```

Expected: PASS (existing /health test still passes; the new function isn't covered by tests yet — that's deliberate, we'll test it via integration).

- [ ] **Step 5: Deploy to Fly**

```bash
cd agents-service && fly deploy
```

Expected: deploy completes successfully. Logs show `agents-service listening on :3000`.

- [ ] **Step 6: Commit**

```bash
git add agents-service/src/inngest/functions/
git commit -m "feat: add hello-world Inngest function for plumbing verification"
```

---

### Task 7: Sync the Fly app with Inngest Cloud (USER ACTION REQUIRED)

**Files:** None (cloud-side configuration)

**Why this matters:** Inngest needs to know your Fly URL so it can dispatch events. This is a one-time setup in the Inngest dashboard.

- [ ] **Step 1: In the browser, go to https://app.inngest.com**

Make sure you're in the **Production** environment (top-left dropdown). You should be on the same project where you created the Event Keys earlier.

- [ ] **Step 2: Click "Apps" in the left sidebar, then "Sync new app" (top-right green button)**

- [ ] **Step 3: Enter the Fly URL and click "Sync app"**

URL: `https://thes1s-agents.fly.dev/api/inngest`

Inngest Cloud will hit that URL and read the function manifest. If successful, you'll see "Sync successful" and the app appears in the list with **1 function: hello-world**.

If the sync fails:
- Most common cause: the Fly app is asleep (auto-stopped). Hit `https://thes1s-agents.fly.dev/health` in your browser first to wake it up, then retry the sync.
- Second most common: the `INNGEST_SIGNING_KEY` Fly secret doesn't match the one in Inngest Cloud. Re-check Task 4.

- [ ] **Step 4: Verify the function is listed**

In the Inngest dashboard, click the new "thes1s-agents" app. You should see **hello-world** listed with trigger `thes1s/hello.world`.

- [ ] **Step 5: Verify completion. Continue to Task 8.**

---

### Task 8: Trigger hello-world end-to-end

**Files:** None (testing the deployed function)

**Why this matters:** We send a real event to Inngest Cloud. Inngest dispatches it to Fly. Fly executes the function. If this works, the entire orchestration plumbing is verified.

- [ ] **Step 1: From your terminal, send the event using `curl`**

You'll need your `INNGEST_EVENT_KEY` value. Replace `<paste-event-key>` below.

```bash
curl -X POST "https://inn.gs/e/<paste-event-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "thes1s/hello.world",
    "data": { "message": "world" }
  }'
```

Expected response: `{"status":200,"ids":["..."]}`

- [ ] **Step 2: Check the Inngest dashboard**

Go to **Runs** in the left sidebar (under Monitor). Within ~5 seconds you should see a run with:
- Function: `hello-world`
- Status: ✅ Completed
- Output: `{"greeting":"Hello, world!","waitedMs":100}`

If status is ❌ Failed: click the run to see the error. Most likely causes:
- Fly app didn't wake up in time (default Inngest retry handles this — wait 30s and check again)
- TypeScript error in the function (check `fly logs --app thes1s-agents`)

- [ ] **Step 3: Check Fly logs to confirm the function ran**

```bash
fly logs --app thes1s-agents
```

You should see request logs around the time you sent the event — POST to `/api/inngest`.

- [ ] **Step 4: Nothing to commit. Continue to Task 9.**

---

### Task 9: Wire Langfuse SDK + add tracing to hello-world

**Files:**
- Create: `agents-service/src/lib/langfuse-client.ts`
- Modify: `agents-service/src/inngest/functions/hello-world.ts`

**Why this matters:** Langfuse captures everything we want to see about agent runs (calls, latency, cost, errors). We add tracing to hello-world to verify Langfuse works before adding it to real agents.

- [ ] **Step 1: Create the Langfuse client wrapper**

Create `agents-service/src/lib/langfuse-client.ts`:
```typescript
import { Langfuse } from 'langfuse';
import { loadEnv } from './env.js';

let cached: Langfuse | null = null;

export function getLangfuse(): Langfuse {
  if (cached) return cached;
  const env = loadEnv();
  cached = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_HOST,
    flushAt: 1,
    flushInterval: 1000,
  });
  return cached;
}

export async function flushLangfuse(): Promise<void> {
  if (cached) await cached.flushAsync();
}
```

**Why `flushAt: 1, flushInterval: 1000`:** Inngest functions are short-lived; we want to flush traces immediately rather than batching, otherwise traces will be lost when the function returns.

- [ ] **Step 2: Update hello-world to emit a trace**

Replace `agents-service/src/inngest/functions/hello-world.ts`:
```typescript
import { inngest } from '../client.js';
import { getLangfuse, flushLangfuse } from '../../lib/langfuse-client.js';

export const helloWorld = inngest.createFunction(
  { id: 'hello-world' },
  { event: 'thes1s/hello.world' },
  async ({ event, step }) => {
    const langfuse = getLangfuse();
    const trace = langfuse.trace({
      name: 'hello-world',
      metadata: { eventId: event.id, runId: event.data.message },
    });

    const greeting = await step.run('compose-greeting', async () => {
      const span = trace.span({ name: 'compose-greeting' });
      const result = `Hello, ${event.data.message}!`;
      span.end({ output: { result } });
      return result;
    });

    const wait = await step.run('compute-wait-ms', async () => {
      const span = trace.span({ name: 'compute-wait-ms' });
      const result = 100;
      span.end({ output: { result } });
      return result;
    });

    await flushLangfuse();
    return { greeting, waitedMs: wait };
  }
);
```

- [ ] **Step 3: Run tests**

```bash
cd agents-service && npm test
```

Expected: PASS.

- [ ] **Step 4: Deploy**

```bash
cd agents-service && fly deploy
```

- [ ] **Step 5: Trigger the event again (same curl as Task 8 Step 1)**

```bash
curl -X POST "https://inn.gs/e/<paste-event-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "thes1s/hello.world", "data": { "message": "langfuse-test" }}'
```

- [ ] **Step 6: Verify the trace appears in Langfuse**

Go to https://us.cloud.langfuse.com → your `thes1s-dev` project → **Tracing** in the sidebar.

Within ~10 seconds a new trace named `hello-world` should appear, with two child spans (`compose-greeting`, `compute-wait-ms`).

If no trace appears:
- Check `fly logs --app thes1s-agents` for any Langfuse errors
- Verify Langfuse keys are set correctly in Fly secrets (`fly secrets list --app thes1s-agents`)

- [ ] **Step 7: Commit**

```bash
git add agents-service/src/lib/langfuse-client.ts agents-service/src/inngest/functions/hello-world.ts
git commit -m "feat: wire Langfuse tracing in hello-world function"
```

---

### Task 10: Phase A acceptance test (manual smoke check)

**Files:** None

**Why this matters:** Before moving on to Phase B (the real agent), we explicitly verify all three external services are talking to each other.

- [ ] **Step 1: Trigger 3 hello-world events back-to-back**

```bash
for i in 1 2 3; do
  curl -X POST "https://inn.gs/e/<paste-event-key>" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"thes1s/hello.world\", \"data\": { \"message\": \"smoke-$i\" }}"
  echo
done
```

- [ ] **Step 2: Check Inngest "Runs" view**

Confirm 3 successful runs in the last 5 minutes.

- [ ] **Step 3: Check Langfuse "Tracing" view**

Confirm 3 new traces named `hello-world` with metadata `runId: smoke-1`, `smoke-2`, `smoke-3`.

- [ ] **Step 4: Check Fly machine status**

```bash
fly status --app thes1s-agents
```

Expected: 1 machine showing recent activity. May be `stopped` if it's been more than ~60s since last activity (auto-stop is working).

**If all three checks pass:** Phase A complete. Infrastructure is good. Move to Phase B.

**If any check fails:** Stop and debug before proceeding. The architecture is meant to be debugged at this layer, not after agents are added.

---

# PHASE B — One Pager Agent (Tasks 11–16)

**Phase B goal:** Migrate the One Pager agent from Anthropic Managed Agents to direct Anthropic SDK calls inside an Inngest function. The agent uses web search, returns structured JSON output, has prompt caching wired in, and is fully traced in Langfuse.

**Phase B success criteria:** You fire `thes1s/onepager.start` with a real ticker (e.g., AAPL). The Fly service runs the One Pager agent. The output validates against the Zod schema. The trace appears in Langfuse with cache hit/miss metrics. The cost is logged.

---

### Task 11: Define Zod schema for One Pager output

**Files:**
- Create: `agents-service/src/agents/schemas/report-section.ts`
- Create: `agents-service/src/agents/schemas/one-pager.ts`
- Test: `agents-service/tests/schemas/one-pager.test.ts`

**Why this matters:** The schema is the contract between the agent and the rest of the system. Validating with Zod means we catch malformed agent output at the boundary instead of in the frontend rendering.

The structure mirrors the existing `ReportSectionSchema` from `src/schemas/` so we don't break the frontend.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/schemas/one-pager.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { OnePagerOutputSchema } from '../../src/agents/schemas/one-pager.js';

describe('OnePagerOutputSchema', () => {
  it('accepts a valid one-pager output', () => {
    const valid = {
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      generatedAt: new Date().toISOString(),
      overallVerdict: 'PASS',
      overallRationale: 'Strong financials, durable moat.',
      sections: [
        {
          key: 'company_info',
          title: 'Company Info',
          status: 'pass',
          confidence: 'HIGH',
          summary: 'Apple makes consumer electronics and services.',
          narrative: 'Apple is a global technology company...',
          citations: [{ id: 1, ref: 'web', text: '...', source: 'apple.com' }],
          redFlags: [],
        },
      ],
    };
    expect(() => OnePagerOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects a one-pager without sections', () => {
    expect(() => OnePagerOutputSchema.parse({ ticker: 'AAPL' })).toThrow();
  });

  it('rejects an invalid verdict value', () => {
    const invalid = {
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      generatedAt: new Date().toISOString(),
      overallVerdict: 'MAYBE',
      overallRationale: '...',
      sections: [],
    };
    expect(() => OnePagerOutputSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd agents-service && npm test -- tests/schemas
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Define ReportSectionSchema (the shared section shape)**

Create `agents-service/src/agents/schemas/report-section.ts`:
```typescript
import { z } from 'zod';

export const CitationSchema = z.object({
  id: z.number().int().positive(),
  ref: z.string(),
  text: z.string(),
  source: z.string(),
});

export const ReportSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: z.enum(['pass', 'fail', 'review', 'pending']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  summary: z.string(),
  narrative: z.string(),
  citations: z.array(CitationSchema).default([]),
  redFlags: z.array(z.string()).default([]),
});

export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type Citation = z.infer<typeof CitationSchema>;
```

- [ ] **Step 4: Define OnePagerOutputSchema**

Create `agents-service/src/agents/schemas/one-pager.ts`:
```typescript
import { z } from 'zod';
import { ReportSectionSchema } from './report-section.js';

export const OnePagerOutputSchema = z.object({
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  generatedAt: z.string().datetime(),
  overallVerdict: z.enum(['PASS', 'FAIL', 'WATCHLIST']),
  overallRationale: z.string(),
  sections: z.array(ReportSectionSchema).min(1),
});

export type OnePagerOutput = z.infer<typeof OnePagerOutputSchema>;
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd agents-service && npm test -- tests/schemas
```

Expected: PASS — 3 tests, 3 passing.

- [ ] **Step 6: Commit**

```bash
git add agents-service/src/agents/schemas/ agents-service/tests/schemas/
git commit -m "feat: Zod schemas for OnePager output and ReportSection"
```

---

### Task 12: Load One Pager prompt from agents-v2/

**Files:**
- Create: `agents-service/src/agents/prompts.ts`
- Test: `agents-service/tests/agents/prompts.test.ts`
- Modify: `agents-service/Dockerfile` (copy prompts into image)

**Why this matters:** We treat all 20 v2 prompts as immutable during migration (per CLAUDE.md and TODOS.md). The agent service reads the prompt from disk at runtime. We bundle the prompts into the Docker image at build time so they're available on Fly without separate deployment steps.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/agents/prompts.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { loadAgentPrompt } from '../../src/agents/prompts.js';

describe('loadAgentPrompt', () => {
  it('loads the One Pager prompt and returns a non-empty string', async () => {
    const prompt = await loadAgentPrompt('one-pager');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(1000);
    expect(prompt).toContain('Rule One');
  });

  it('throws on unknown agent name', async () => {
    await expect(loadAgentPrompt('does-not-exist')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd agents-service && npm test -- tests/agents
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the prompt loader**

Create `agents-service/src/agents/prompts.ts`:
```typescript
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve prompts relative to the dist/ output. At dev time, prompts live at
// ../../../agents-v2/<name>/prompt.md from src/agents/. At runtime in Docker,
// they're copied to the same relative path.
const PROMPTS_ROOT = resolve(__dirname, '../../../agents-v2');

const cache = new Map<string, string>();

export async function loadAgentPrompt(agentName: string): Promise<string> {
  if (cache.has(agentName)) return cache.get(agentName)!;

  const path = resolve(PROMPTS_ROOT, agentName, 'prompt.md');
  const content = await readFile(path, 'utf-8');

  if (!content.trim()) {
    throw new Error(`Empty prompt at ${path}`);
  }
  cache.set(agentName, content);
  return content;
}
```

- [ ] **Step 4: Update Dockerfile to copy prompts into the image**

Replace `agents-service/Dockerfile` with:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Copy agent prompts from the parent repo into the image so loadAgentPrompt() can read them.
# Build context is set to the project root in fly.toml so this path is reachable.
COPY agents-v2 ./agents-v2

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 5: Update fly.toml to set the build context to the project root**

Replace the `[build]` section in `agents-service/fly.toml` with:
```toml
[build]
  dockerfile = "agents-service/Dockerfile"
  # Build context = repo root (so we can COPY agents-v2/)
```

Also, deploys must now be run from the project root, not from `agents-service/`:
```bash
fly deploy --config agents-service/fly.toml
```

Update `agents-service/README.md` to reflect this:
```markdown
## Deploy

Run from the project root (not from agents-service/):

\```bash
fly deploy --config agents-service/fly.toml
\```
```

- [ ] **Step 6: Run the test, verify it passes**

```bash
cd agents-service && npm test -- tests/agents
```

Expected: PASS — 2 tests, 2 passing.

- [ ] **Step 7: Commit**

```bash
git add agents-service/src/agents/prompts.ts agents-service/tests/agents/ agents-service/Dockerfile agents-service/fly.toml agents-service/README.md
git commit -m "feat: agent prompt loader reads from agents-v2/ baked into Docker image"
```

---

### Task 13: Anthropic client wrapper with caching + tool-call output + Langfuse

**Files:**
- Create: `agents-service/src/lib/anthropic-client.ts`
- Test: `agents-service/tests/lib/anthropic-client.test.ts`

**Why this matters:** This is the load-bearing wrapper. It enforces:
1. **Forced tool-call output** — guarantees the agent returns valid JSON matching the Zod schema
2. **Prompt caching** — system prompt + DataPacket get cached for ~10x cost reduction on subsequent agents
3. **Langfuse instrumentation** — every call emits a trace with tokens + cost + latency
4. **Anthropic SDK retries** — bumped to 4 retries with exponential backoff for transient errors

We use **forced tool calling** (`tool_choice: { type: "tool", name: "..." }`) rather than Anthropic's newer native structured outputs because: (a) tool calling is universally supported across Claude versions; (b) it's the same pattern Pitch Deck/Full Story will use when we have multiple tools; (c) it composes cleanly with web_search. We can switch to native structured outputs later as an optimization.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/lib/anthropic-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the Anthropic SDK before importing the wrapper
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create },
    })),
    __mockCreate: create,
  };
});

vi.mock('../../src/lib/langfuse-client.js', () => ({
  getLangfuse: () => ({
    trace: () => ({
      generation: () => ({ end: vi.fn() }),
      span: () => ({ end: vi.fn() }),
    }),
  }),
  flushLangfuse: vi.fn(),
}));

const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');
const sdk = await import('@anthropic-ai/sdk');
// @ts-expect-error — accessing the mock helper
const mockCreate = (sdk as any).__mockCreate;

const TestSchema = z.object({ verdict: z.enum(['yes', 'no']), reason: z.string() });

describe('callAgentWithStructuredOutput', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns parsed output when the model emits a tool_use block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_output',
          input: { verdict: 'yes', reason: 'good' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const result = await callAgentWithStructuredOutput({
      systemPrompt: 'You are a test agent.',
      userMessage: 'Test',
      schema: TestSchema,
      schemaName: 'TestOutput',
      schemaDescription: 'Test',
      model: 'claude-sonnet-4-6',
      traceName: 'test',
    });

    expect(result).toEqual({ verdict: 'yes', reason: 'good' });
  });

  it('throws when no tool_use block is returned', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I refuse.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    await expect(
      callAgentWithStructuredOutput({
        systemPrompt: 'You are a test agent.',
        userMessage: 'Test',
        schema: TestSchema,
        schemaName: 'TestOutput',
        schemaDescription: 'Test',
        model: 'claude-sonnet-4-6',
        traceName: 'test',
      })
    ).rejects.toThrow(/no tool_use block/i);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd agents-service && npm test -- tests/lib
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the wrapper**

Create `agents-service/src/lib/anthropic-client.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { loadEnv } from './env.js';
import { getLangfuse } from './langfuse-client.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const env = loadEnv();
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 4 });
  return client;
}

export interface CallAgentParams<T> {
  systemPrompt: string;
  userMessage: string;
  /** Optional cacheable user-side block (e.g. DataPacket). Cached separately from system prompt. */
  cacheableContext?: string;
  schema: z.ZodSchema<T>;
  schemaName: string;
  schemaDescription: string;
  model: string;
  maxTokens?: number;
  traceName: string;
  traceMetadata?: Record<string, unknown>;
  /** Pass tools (e.g. web_search) — they coexist with the forced output tool. */
  tools?: Array<Record<string, unknown>>;
}

export async function callAgentWithStructuredOutput<T>(params: CallAgentParams<T>): Promise<T> {
  const anthropic = getClient();
  const langfuse = getLangfuse();

  const trace = langfuse.trace({ name: params.traceName, metadata: params.traceMetadata });
  const generation = trace.generation({
    name: 'anthropic-call',
    model: params.model,
    input: { system: params.systemPrompt.slice(0, 500), user: params.userMessage.slice(0, 500) },
  });

  // Build the schema-emitting tool. Forcing tool_choice on this tool guarantees the model
  // returns a single tool_use block matching the schema.
  const outputTool = {
    name: 'emit_output',
    description: params.schemaDescription,
    input_schema: zodToJsonSchema(params.schema, params.schemaName) as Record<string, unknown>,
  };

  // Construct the system prompt as a content array so we can attach cache_control.
  // System prompt is cached (5min ephemeral) — agent specialists with the same
  // system prompt + same DataPacket will hit cache for ~10x cost reduction on input.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  // If cacheable context is provided (e.g. DataPacket), put it as the first user-message
  // content block with its own cache_control breakpoint.
  const userContent: Anthropic.ContentBlockParam[] = [];
  if (params.cacheableContext) {
    userContent.push({
      type: 'text',
      text: params.cacheableContext,
      cache_control: { type: 'ephemeral' },
    });
  }
  userContent.push({ type: 'text', text: params.userMessage });

  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 8000,
    system,
    messages: [{ role: 'user', content: userContent }],
    tools: [...(params.tools ?? []), outputTool],
    tool_choice: { type: 'tool', name: 'emit_output' },
  });

  generation.end({
    output: { stopReason: response.stop_reason },
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
      cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
    },
  });

  // Find the tool_use block — there should be exactly one because of tool_choice.
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'emit_output') {
    throw new Error(`Anthropic returned no tool_use block (stop_reason=${response.stop_reason})`);
  }

  // Validate against Zod schema. If parse fails, throw — the Inngest retry policy
  // will catch and retry with the validation error in the prompt (handled in Task 15).
  const parsed = params.schema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Schema validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
```

- [ ] **Step 4: Add zod-to-json-schema dependency**

```bash
cd agents-service && npm install zod-to-json-schema
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
cd agents-service && npm test -- tests/lib
```

Expected: PASS — 2 tests, 2 passing.

- [ ] **Step 6: Commit**

```bash
git add agents-service/src/lib/anthropic-client.ts agents-service/tests/lib/ agents-service/package.json agents-service/package-lock.json
git commit -m "feat: Anthropic client wrapper with prompt caching, forced tool-call output, Langfuse tracing"
```

---

### Task 14: One Pager agent runner

**Files:**
- Create: `agents-service/src/agents/one-pager.ts`
- Test: `agents-service/tests/agents/one-pager.test.ts`

**Why this matters:** This is the actual agent. It loads the prompt, calls the wrapper from Task 13, returns the structured output. **No Inngest dependency** — the agent is testable as a pure function. Inngest wraps this in Task 15.

- [ ] **Step 1: Write the failing test**

Create `agents-service/tests/agents/one-pager.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/anthropic-client.js', () => ({
  callAgentWithStructuredOutput: vi.fn(),
}));

vi.mock('../../src/agents/prompts.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('SYSTEM PROMPT (mocked)'),
}));

const { runOnePagerAgent } = await import('../../src/agents/one-pager.js');
const { callAgentWithStructuredOutput } = await import('../../src/lib/anthropic-client.js');

describe('runOnePagerAgent', () => {
  it('passes ticker into user message and returns parsed output', async () => {
    (callAgentWithStructuredOutput as any).mockResolvedValueOnce({
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      generatedAt: new Date().toISOString(),
      overallVerdict: 'PASS',
      overallRationale: '...',
      sections: [{
        key: 'company_info', title: 'Company Info', status: 'pass',
        confidence: 'HIGH', summary: '...', narrative: '...', citations: [], redFlags: [],
      }],
    });

    const result = await runOnePagerAgent({ ticker: 'AAPL', runId: 'r1' });
    expect(result.ticker).toBe('AAPL');
    expect((callAgentWithStructuredOutput as any).mock.calls[0][0].userMessage).toContain('AAPL');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd agents-service && npm test -- tests/agents/one-pager
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the agent runner**

Create `agents-service/src/agents/one-pager.ts`:
```typescript
import { OnePagerOutput, OnePagerOutputSchema } from './schemas/one-pager.js';
import { loadAgentPrompt } from './prompts.js';
import { callAgentWithStructuredOutput } from '../lib/anthropic-client.js';

export interface OnePagerInput {
  ticker: string;
  runId: string;
}

const ONE_PAGER_MODEL = 'claude-sonnet-4-6';

export async function runOnePagerAgent(input: OnePagerInput): Promise<OnePagerOutput> {
  const systemPrompt = await loadAgentPrompt('one-pager');

  const userMessage = `Generate a One Pager for ticker ${input.ticker}. Use web search to gather current information about the company. Return your output via the emit_output tool with the structured schema.`;

  // Web search tool — server-managed by Anthropic. max_uses caps total searches per run.
  const webSearchTool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 10,
  };

  return callAgentWithStructuredOutput({
    systemPrompt,
    userMessage,
    schema: OnePagerOutputSchema,
    schemaName: 'OnePagerOutput',
    schemaDescription:
      'Emit the One Pager analysis as a structured object matching the OnePagerOutput schema.',
    model: ONE_PAGER_MODEL,
    maxTokens: 8000,
    traceName: 'one-pager',
    traceMetadata: { ticker: input.ticker, runId: input.runId },
    tools: [webSearchTool],
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd agents-service && npm test -- tests/agents/one-pager
```

Expected: PASS — 1 test, 1 passing.

- [ ] **Step 5: Commit**

```bash
git add agents-service/src/agents/one-pager.ts agents-service/tests/agents/one-pager.test.ts
git commit -m "feat: One Pager agent runner with web search + structured output"
```

---

### Task 15: Wrap One Pager in an Inngest function

**Files:**
- Create: `agents-service/src/lib/worker-callback.ts`
- Create: `agents-service/src/inngest/functions/one-pager.ts`
- Modify: `agents-service/src/inngest/functions/index.ts`

**Why this matters:** Inngest handles durability — if the agent crashes mid-run, Inngest retries automatically without losing the parts that already succeeded. The function has three steps: (1) run the agent, (2) validate the output, (3) callback to the Worker. Each step is independently retryable.

- [ ] **Step 1: Implement the worker callback helper**

Create `agents-service/src/lib/worker-callback.ts`:
```typescript
import { loadEnv } from './env.js';

export type CallbackStatus = 'completed' | 'failed';

export interface CallbackPayload {
  runId: string;
  status: CallbackStatus;
  result?: unknown;
  error?: string;
}

export async function postCallback(payload: CallbackPayload): Promise<void> {
  const env = loadEnv();
  const url = `${env.WORKER_CALLBACK_URL}/api/v3/pipeline/callback`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Callback-Secret': env.WORKER_CALLBACK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Worker callback failed (${res.status}): ${body}`);
  }
}
```

- [ ] **Step 2: Create the One Pager Inngest function**

Create `agents-service/src/inngest/functions/one-pager.ts`:
```typescript
import { inngest } from '../client.js';
import { runOnePagerAgent } from '../../agents/one-pager.js';
import { OnePagerOutputSchema } from '../../agents/schemas/one-pager.js';
import { postCallback } from '../../lib/worker-callback.js';
import { flushLangfuse } from '../../lib/langfuse-client.js';

export const onePagerFn = inngest.createFunction(
  {
    id: 'one-pager',
    retries: 3,
    // 15-minute hard ceiling — One Pager normally takes 4-5 min. If exceeded, fail fast.
    timeouts: { finish: '15m' },
    onFailure: async ({ event, error }) => {
      // Always inform the Worker of terminal failure so the run isn't stuck "running" forever.
      await postCallback({
        runId: event.data.event.data.runId,
        status: 'failed',
        error: error.message,
      });
    },
  },
  { event: 'thes1s/onepager.start' },
  async ({ event, step }) => {
    const { runId, ticker } = event.data;

    const output = await step.run('run-one-pager-agent', async () => {
      return runOnePagerAgent({ ticker, runId });
    });

    await step.run('validate-output', async () => {
      const parsed = OnePagerOutputSchema.safeParse(output);
      if (!parsed.success) {
        throw new Error(`Schema validation failed at gate: ${parsed.error.message}`);
      }
    });

    await step.run('post-callback', async () => {
      await postCallback({ runId, status: 'completed', result: output });
    });

    await flushLangfuse();
    return { runId, ticker, sections: output.sections.length };
  }
);
```

**Notes on the design:**
- `retries: 3` — Inngest will retry the *failing step* 3 times with exponential backoff. The agent call is wrapped in its own step, so a transient Anthropic 5xx retries that one step without re-running the validation or callback.
- `timeouts: { finish: '15m' }` — hard ceiling. One Pager usually takes 4-5 min; 15 min is generous and prevents runaway runs.
- `onFailure` — terminal failure handler. Even after retries exhausted, the Worker gets notified so the frontend doesn't show "running" forever.

- [ ] **Step 3: Register the function**

Replace `agents-service/src/inngest/functions/index.ts`:
```typescript
import { helloWorld } from './hello-world.js';
import { onePagerFn } from './one-pager.js';

export const functions = [helloWorld, onePagerFn] as const;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd agents-service && npm run typecheck
```

Expected: no output (success).

- [ ] **Step 5: Run all tests**

```bash
cd agents-service && npm test
```

Expected: all PASS.

- [ ] **Step 6: Deploy and re-sync with Inngest**

```bash
fly deploy --config agents-service/fly.toml
```

After deploy, Inngest should auto-sync because the app URL hasn't changed. Verify in app.inngest.com → Apps → thes1s-agents → you should now see **2 functions: hello-world + one-pager**.

If the function doesn't appear: go to Apps → thes1s-agents → click "Resync" or re-do the manual sync from Task 7.

- [ ] **Step 7: Commit**

```bash
git add agents-service/src/lib/worker-callback.ts agents-service/src/inngest/functions/
git commit -m "feat: One Pager Inngest function with retries, timeout, callback"
```

---

### Task 16: Integration test — One Pager end-to-end (real Anthropic)

**Files:**
- Create: `agents-service/tests/integration/one-pager.test.ts`

**Why this matters:** Unit tests verify components work in isolation. We need one end-to-end test that hits real Anthropic, real Langfuse, and confirms the full agent run produces a valid output. Gated by an env flag so it doesn't run in normal CI.

- [ ] **Step 1: Create the integration test**

Create `agents-service/tests/integration/one-pager.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { runOnePagerAgent } from '../../src/agents/one-pager.js';
import { OnePagerOutputSchema } from '../../src/agents/schemas/one-pager.js';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

describe.runIf(RUN_INTEGRATION)('one-pager integration', () => {
  it('produces a valid OnePagerOutput for AAPL', async () => {
    const result = await runOnePagerAgent({ ticker: 'AAPL', runId: 'integration-test-1' });

    // Schema validation
    expect(() => OnePagerOutputSchema.parse(result)).not.toThrow();

    // Content sanity checks
    expect(result.ticker).toBe('AAPL');
    expect(result.companyName.toLowerCase()).toContain('apple');
    expect(result.sections.length).toBeGreaterThanOrEqual(4);
    expect(['PASS', 'FAIL', 'WATCHLIST']).toContain(result.overallVerdict);

    // Each section has the required fields
    for (const section of result.sections) {
      expect(section.narrative.length).toBeGreaterThan(50);
    }
  }, 600_000); // 10 min timeout
});
```

- [ ] **Step 2: Run the integration test against real Anthropic**

You need an `.env` file populated for this. From the project root:
```bash
cp .env.local agents-service/.env
```

Then rename `ANTHROPIC_API_KEY_AGENTS` to `ANTHROPIC_API_KEY` in the copied file (since the agents-service uses the bare `ANTHROPIC_API_KEY` name internally):
```bash
cd agents-service
sed -i.bak 's/^ANTHROPIC_API_KEY_AGENTS=/ANTHROPIC_API_KEY=/' .env
rm .env.bak
```

Then run:
```bash
cd agents-service && RUN_INTEGRATION=1 npm test -- tests/integration
```

Expected: 1 PASS in 4-7 minutes. Cost: ~$1-2.

- [ ] **Step 3: Verify the trace appeared in Langfuse**

Go to Langfuse → Tracing. You should see a trace named `one-pager` with metadata `ticker: AAPL, runId: integration-test-1`, with child generations showing token counts and cost.

- [ ] **Step 4: Note known-good baseline**

Once you've confirmed it produces a valid output, note the **cost** and **duration** from Langfuse. These are your baselines — Pitch Deck and Full Story should be in the same ballpark per agent.

- [ ] **Step 5: Don't commit `.env`** (it's in `.gitignore`). The integration test file itself is fine to commit.

```bash
git add agents-service/tests/integration/
git commit -m "test: end-to-end One Pager integration test (gated by RUN_INTEGRATION=1)"
```

**Phase B complete** — the One Pager agent runs end-to-end through the new infrastructure, produces validated output, and is fully traced.

---

# PHASE C — Worker Integration (Tasks 17–20)

**Phase C goal:** Wire the Worker to dispatch One Pager runs to Inngest, receive the callback, and store results in D1. Frontend uses a feature flag to opt into v3.

---

### Task 17: D1 schema for v3 runs + new Worker routes

**Files:**
- Modify: `api/schema.sql`
- Create: `api/src/routes/pipeline-v3.js`
- Modify: `api/src/index.js`
- Modify: `api/wrangler.toml`

**Why this matters:** v3 runs need to be tracked separately from v1 (Managed Agents) so we can run both pipelines side-by-side during validation. New table `v3_runs` keys on the runId and stores status + result.

- [ ] **Step 1: Add the v3_runs table to the schema**

Append to `api/schema.sql`:
```sql
-- v3 pipeline runs (Inngest-orchestrated)
CREATE TABLE IF NOT EXISTS v3_runs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  pipeline_stage TEXT NOT NULL,           -- 'one-pager' | 'pitch-deck' | 'full-story'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  result_json TEXT,                       -- the agent output (full report) when completed
  error_message TEXT,                     -- error string when failed
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_v3_runs_user_ticker ON v3_runs(user_id, ticker, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_v3_runs_status ON v3_runs(status);
```

- [ ] **Step 2: Apply the schema migration**

Apply locally:
```bash
cd api && wrangler d1 execute thes1s --local --file=schema.sql
```

Apply to production:
```bash
cd api && wrangler d1 execute thes1s --remote --file=schema.sql
```

Verify the table exists:
```bash
cd api && wrangler d1 execute thes1s --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='v3_runs';"
```

Expected output: a row showing `v3_runs`.

- [ ] **Step 3: Create the v3 pipeline route handler**

Create `api/src/routes/pipeline-v3.js`:
```javascript
// v3 pipeline routes — dispatch to Inngest, status polling, and Fly callback receiver.
// POST /api/v3/pipeline/onepager/start  — kicks off a One Pager run
// GET  /api/v3/pipeline/status/:runId    — polls D1 for run status
// POST /api/v3/pipeline/callback         — Fly service POSTs final result here

import { Inngest } from 'inngest';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function getInngestClient(env) {
  return new Inngest({
    id: 'thes1s-worker',
    eventKey: env.INNGEST_EVENT_KEY,
  });
}

export async function handlePipelineV3(request, env, path, user) {
  // POST /api/v3/pipeline/onepager/start
  if (request.method === 'POST' && path === '/api/v3/pipeline/onepager/start') {
    return handleOnePagerStart(request, env, user);
  }

  // GET /api/v3/pipeline/status/:runId
  const statusMatch = path.match(/^\/api\/v3\/pipeline\/status\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'GET' && statusMatch) {
    return handleStatus(env, user, statusMatch[1]);
  }

  // POST /api/v3/pipeline/callback (UNAUTHENTICATED — uses shared secret instead)
  if (request.method === 'POST' && path === '/api/v3/pipeline/callback') {
    return handleCallback(request, env);
  }

  return null; // route not handled — let the main router 404
}

async function handleOnePagerStart(request, env, user) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const ticker = (body.ticker ?? '').toString().trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return json({ error: 'Invalid ticker' }, 400);
  }

  const runId = crypto.randomUUID();

  // Insert v3_runs row before sending the event so the status endpoint is queryable immediately.
  await env.DB.prepare(
    `INSERT INTO v3_runs (id, user_id, ticker, pipeline_stage, status) VALUES (?, ?, ?, 'one-pager', 'running')`
  ).bind(runId, user.id, ticker).run();

  // Send Inngest event
  const inngest = getInngestClient(env);
  await inngest.send({
    name: 'thes1s/onepager.start',
    data: { runId, ticker, userId: String(user.id) },
  });

  return json({ runId, status: 'running' }, 202);
}

async function handleStatus(env, user, runId) {
  const row = await env.DB.prepare(
    `SELECT id, ticker, pipeline_stage, status, result_json, error_message, started_at, finished_at
     FROM v3_runs WHERE id = ? AND user_id = ?`
  ).bind(runId, user.id).first();

  if (!row) return json({ error: 'Run not found' }, 404);

  const result = row.result_json ? JSON.parse(row.result_json) : null;

  return json({
    runId: row.id,
    ticker: row.ticker,
    pipelineStage: row.pipeline_stage,
    status: row.status,
    result,
    error: row.error_message ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
}

async function handleCallback(request, env) {
  // Auth via shared secret (Fly knows V3_CALLBACK_SECRET; Worker has the same).
  const provided = request.headers.get('X-Callback-Secret');
  if (!provided || provided !== env.V3_CALLBACK_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { runId, status, result, error } = body;
  if (!runId || !['completed', 'failed'].includes(status)) {
    return json({ error: 'Invalid callback payload' }, 400);
  }

  if (status === 'completed') {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'completed', result_json = ?, finished_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(result ?? {}), runId).run();
  } else {
    await env.DB.prepare(
      `UPDATE v3_runs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ?`
    ).bind(String(error ?? 'Unknown error'), runId).run();
  }

  return json({ ok: true });
}
```

- [ ] **Step 4: Register the v3 routes in the main Worker entrypoint**

Open `api/src/index.js` and find where `handlePipeline` is imported and called. Add the v3 import and registration **before** the v1 pipeline routes. The exact location depends on the existing structure — look for a block like `if (path.startsWith('/api/pipeline'))` and add an analogous v3 block above it.

Example pattern (adjust to match your existing routing structure):
```javascript
import { handlePipelineV3 } from './routes/pipeline-v3.js';

// ... inside the request handler, after auth ...

// v3 pipeline (Inngest-orchestrated) — public callback route + authenticated start/status
if (path === '/api/v3/pipeline/callback' && request.method === 'POST') {
  // Public route: handler validates X-Callback-Secret instead of session
  return handlePipelineV3(request, env, path, null);
}

if (path.startsWith('/api/v3/pipeline/')) {
  // Authenticated routes
  if (!user) return new Response('Unauthorized', { status: 401 });
  const v3Response = await handlePipelineV3(request, env, path, user);
  if (v3Response) return v3Response;
}
```

**Verify by reading the existing `api/src/index.js`** — match the registration style of `handlePipeline` (the v1 handler).

- [ ] **Step 5: Add Worker secrets**

```bash
cd api
wrangler secret put INNGEST_EVENT_KEY
# (paste the same value you set for the Fly service)

wrangler secret put V3_CALLBACK_SECRET
# (paste the same random string you generated and set for WORKER_CALLBACK_SECRET on Fly)
```

- [ ] **Step 6: Deploy the Worker**

```bash
cd api && wrangler deploy
```

Expected: deploy completes successfully.

- [ ] **Step 7: Smoke test the start endpoint (auth required)**

You'll need a valid session cookie. Test through the frontend in Task 20. For now, just verify the routes exist by testing the public callback:

```bash
curl -X POST https://api.thes1sinvesting.com/api/v3/pipeline/callback \
  -H "Content-Type: application/json" \
  -d '{}' \
  -i
```

Expected: HTTP 401 (Unauthorized — because no `X-Callback-Secret` header). This proves the route is registered and the auth check works.

- [ ] **Step 8: Commit**

```bash
git add api/schema.sql api/src/routes/pipeline-v3.js api/src/index.js
git commit -m "feat: v3 pipeline routes (Worker → Inngest dispatch + Fly callback)"
```

---

### Task 18: Add Inngest dependency to the Worker

**Files:**
- Modify: `api/package.json`

**Why this matters:** The Worker needs the Inngest SDK to send events. Inngest is Workers-compatible (uses Web fetch).

- [ ] **Step 1: Install in the api/ directory**

```bash
cd api && npm install inngest
```

- [ ] **Step 2: Verify it builds**

```bash
cd api && wrangler deploy --dry-run
```

Expected: build succeeds, no errors. If you see "module not found", the import path in `pipeline-v3.js` is wrong.

- [ ] **Step 3: Commit**

```bash
git add api/package.json api/package-lock.json
git commit -m "feat: add Inngest SDK to Worker for event dispatch"
```

---

### Task 19: End-to-end backend test (no frontend yet)

**Files:** None

**Why this matters:** Before touching the frontend, verify the entire backend chain works — Worker accepts a request, fires Inngest, Fly runs the agent, callbacks fire, D1 updates.

- [ ] **Step 1: Get a session cookie**

Open https://thes1sinvesting.com in your browser and log in. Open DevTools → Application → Cookies → copy the value of the session cookie (likely named `session` or similar — check your existing auth implementation).

- [ ] **Step 2: Trigger a One Pager run via the new v3 endpoint**

Replace `<paste-cookie>` with the cookie value:
```bash
curl -X POST https://api.thes1sinvesting.com/api/v3/pipeline/onepager/start \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<paste-cookie>" \
  -d '{"ticker": "AAPL"}'
```

Expected response:
```json
{"runId": "abc-123-...", "status": "running"}
```

- [ ] **Step 3: Watch Inngest dashboard**

Go to app.inngest.com → Runs. Within 5 seconds a new `one-pager` run should appear with status "Running".

- [ ] **Step 4: Watch Fly logs**

```bash
fly logs --app thes1s-agents
```

You'll see the function execute, with steps logged: `run-one-pager-agent` → `validate-output` → `post-callback`.

- [ ] **Step 5: Check D1 row periodically**

```bash
cd api && wrangler d1 execute thes1s --remote --command="SELECT id, status, started_at, finished_at FROM v3_runs ORDER BY started_at DESC LIMIT 1;"
```

You'll see status progress: `running` → (after ~5 min) → `completed`.

- [ ] **Step 6: Fetch the result via status endpoint**

Replace `<runId>` with the runId from Step 2:
```bash
curl https://api.thes1sinvesting.com/api/v3/pipeline/status/<runId> \
  -H "Cookie: session=<paste-cookie>"
```

Expected: full JSON response including the `result` field with the One Pager output.

- [ ] **Step 7: Verify Langfuse trace**

Langfuse → Tracing → confirm the `one-pager` trace exists for this run, with cost + tokens visible.

**If all 7 steps work:** the backend chain is verified end-to-end.

**If any step fails:** stop and debug. The most common failure points:
- Inngest event not received → check `INNGEST_EVENT_KEY` matches between Worker and Fly
- Callback fails → check `WORKER_CALLBACK_SECRET` matches between Worker (`V3_CALLBACK_SECRET`) and Fly
- Run status stuck on "running" → check `fly logs` for errors; the `onFailure` handler should mark it failed if the agent throws

- [ ] **Step 8: Nothing to commit. Continue to Task 20.**

---

### Task 20: Frontend feature flag for v3 One Pager

**Files:**
- Modify: `src/config.js`
- Create: `src/hooks/useOnePagerV3.js`
- Modify: One existing component that calls One Pager (likely an existing `useOnePager` hook or a button component) — check `src/hooks/` and `src/components/`

**Why this matters:** Wire the frontend to the new backend behind a feature flag, so we can toggle between v1 (Managed Agents) and v3 (Inngest) without code changes during validation.

- [ ] **Step 1: Find the existing One Pager hook**

```bash
grep -rn "onepager\|one-pager\|OnePager\|/api/pipeline/run" /Users/kylehoff/Desktop/stock-analyzer/src/ | head
```

Note the file paths returned. The existing flow likely uses a hook like `useOnePagerPipeline` in `src/hooks/` and a button in `src/components/`.

- [ ] **Step 2: Add the feature flag to config**

Open `src/config.js` and add:
```javascript
// Feature flags
export const USE_V3_ONEPAGER = import.meta.env.VITE_USE_V3_ONEPAGER === 'true';
```

In the project root `.env.local`, add (this is **not** a secret, it's a feature flag — `VITE_` prefix is fine):
```
VITE_USE_V3_ONEPAGER=true
```

- [ ] **Step 3: Create the v3 hook (parallel to existing v1 hook)**

Create `src/hooks/useOnePagerV3.js`:
```javascript
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiBase } from '../engines/apiBase';

export function useOnePagerV3() {
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | running | completed | failed
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollTimer = useRef(null);

  const start = useCallback(async (ticker) => {
    setStatus('running');
    setResult(null);
    setError(null);

    const res = await fetch(`${apiBase}/api/v3/pipeline/onepager/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });

    if (!res.ok) {
      setStatus('failed');
      setError(`Start failed: ${res.status}`);
      return;
    }

    const { runId: newRunId } = await res.json();
    setRunId(newRunId);
  }, []);

  // Poll status every 3s while running
  useEffect(() => {
    if (status !== 'running' || !runId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/v3/pipeline/status/${runId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.status === 'completed') {
          setResult(data.result);
          setStatus('completed');
        } else if (data.status === 'failed') {
          setError(data.error);
          setStatus('failed');
        } else {
          pollTimer.current = setTimeout(poll, 3000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setStatus('failed');
        }
      }
    };

    pollTimer.current = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [status, runId]);

  return { start, status, result, error, runId };
}
```

- [ ] **Step 4: Switch the existing component to use the flag**

Open the file from Step 1 (the component or hook that triggers One Pager). Add the flag import and conditionally call v1 or v3:

```javascript
import { USE_V3_ONEPAGER } from '../config';
import { useOnePagerV3 } from '../hooks/useOnePagerV3';
import { useOnePagerPipeline } from '../hooks/useOnePagerPipeline'; // existing v1 hook — name may differ

function OnePagerStarter({ ticker }) {
  const v3 = useOnePagerV3();
  const v1 = useOnePagerPipeline();
  const pipeline = USE_V3_ONEPAGER ? v3 : v1;
  // ... rest of component uses `pipeline.start(...)`, `pipeline.status`, etc.
}
```

**Important:** the hooks must have **interface-compatible return shapes** — both should expose `{ start, status, result, error, runId }`. If they don't, write an adapter for the v1 hook in this same file.

- [ ] **Step 5: Run frontend dev server**

```bash
npm run dev
```

In another terminal, ensure the Worker is deployed (Task 17 step 6) and the Fly service is running (Task 15 step 6).

- [ ] **Step 6: Manual UI test**

Open http://localhost:5173 → log in → search for AAPL → click "Generate One Pager".

Expected:
- Status text changes to "running"
- Browser console shows polling requests every ~3 seconds
- After 4-7 minutes, status changes to "completed" and the report renders
- The rendered output should match the existing One Pager UI (since the schema is the same)

- [ ] **Step 7: Commit**

```bash
git add src/config.js src/hooks/useOnePagerV3.js <other-modified-files>
git commit -m "feat: frontend feature flag for v3 One Pager pipeline"
```

---

# PHASE D — Verification (Tasks 21–23)

**Phase D goal:** Confirm v3 produces equivalent output to v1, document the new architecture, and decide whether to flip the flag for production users.

---

### Task 21: Side-by-side comparison test (v1 vs v3)

**Files:**
- Create: `agents-service/scripts/compare-v1-v3.ts`

**Why this matters:** We need to confirm the new pipeline produces output of equal quality to the existing one before cutting over.

- [ ] **Step 1: Pick 3 known-verdict tickers**

From your observatory wiki or memory, pick 3 tickers where you know the expected verdict. Example: AAPL (PASS), TSLA (WATCHLIST), one FAIL ticker of your choice.

- [ ] **Step 2: Create the comparison script**

Create `agents-service/scripts/compare-v1-v3.ts`:
```typescript
import { runOnePagerAgent } from '../src/agents/one-pager.js';

const TICKERS = ['AAPL', 'TSLA', 'GME']; // adjust to your known-verdict set

async function main() {
  for (const ticker of TICKERS) {
    console.log(`\n=== ${ticker} ===`);
    const start = Date.now();
    const result = await runOnePagerAgent({ ticker, runId: `compare-${ticker}` });
    const elapsed = Math.round((Date.now() - start) / 1000);

    console.log(`Verdict: ${result.overallVerdict}`);
    console.log(`Sections: ${result.sections.length}`);
    console.log(`Duration: ${elapsed}s`);
    console.log(`Rationale: ${result.overallRationale.slice(0, 200)}...`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the v3 comparison**

```bash
cd agents-service && npx tsx scripts/compare-v1-v3.ts
```

This runs ~20 minutes and costs ~$5. Capture the output.

- [ ] **Step 4: For each ticker, run the v1 pipeline through the live app**

In the browser (with `VITE_USE_V3_ONEPAGER=false`), kick off One Pager for each of the same tickers. Note the verdicts and rationales.

- [ ] **Step 5: Manual comparison**

For each ticker, eyeball:
- Are the verdicts the same? (if PASS in v1 and FAIL in v3, that's a real regression)
- Is the section count the same?
- Are the rationales substantively similar (same key facts cited)?

You don't need byte-for-byte equivalence — these are LLM outputs and will differ across runs. You're looking for substantive disagreement.

- [ ] **Step 6: Document findings**

Create a brief markdown note (anywhere in the repo, e.g. `gstack/qa-reports/v3-onepager-comparison-20260502.md`) capturing:
- Which tickers were tested
- v1 vs v3 verdicts
- Cost/duration delta
- Subjective quality assessment

- [ ] **Step 7: Commit the script (and the QA note if you wrote one)**

```bash
git add agents-service/scripts/
git commit -m "test: v1 vs v3 One Pager comparison script"
```

---

### Task 22: Documentation update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `agents-service/README.md`

**Why this matters:** Future you (or future Claude) needs to know v3 exists and how it works.

- [ ] **Step 1: Add a v3 architecture section to CLAUDE.md**

Find the **Agent Pipeline (Managed Agents v2)** section and add immediately after it:
```markdown
## v3 Pipeline (Inngest + Fly + Direct Anthropic SDK)

**Status:** One Pager live in v3 (Phase 1 complete). Pitch Deck and Full Story remain on v1 Managed Agents until subsequent migration phases.

**Architecture:**
- **Worker (CF)**: Auth, D1/R2, DataPacket assembly, fires Inngest events for v3 runs
- **Inngest Cloud**: Event queue, durable retries, journal-based recovery
- **Fly.io `thes1s-agents`**: TypeScript Fastify service hosting Inngest functions
- **Anthropic SDK direct**: No agent framework. Tool-call output forces JSON schema. Prompt caching enabled.
- **Langfuse Cloud**: Observability — every Anthropic call traced with cost + tokens

**Routes:**
- `POST /api/v3/pipeline/onepager/start {ticker}` — fire `thes1s/onepager.start` event, return `runId`
- `GET /api/v3/pipeline/status/:runId` — poll D1 `v3_runs` table
- `POST /api/v3/pipeline/callback` — Fly POSTs result here (auth via shared secret)

**Feature flag:** `VITE_USE_V3_ONEPAGER=true` in `.env.local` switches frontend from v1 to v3.

**Deploy commands:**
- Fly service: `fly deploy --config agents-service/fly.toml` (from project root)
- Worker (existing): `cd api && wrangler deploy`

**See also:** `gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md` for the migration plan.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document v3 pipeline architecture"
```

---

### Task 23: Retry-policy hardening (cost protection)

**Files:**
- Modify: `agents-service/src/inngest/functions/one-pager.ts`
- Modify: `agents-service/src/lib/anthropic-client.ts`
- Test: `agents-service/tests/lib/anthropic-client.test.ts` (add 4xx-no-retry assertion)

**Why this matters:** During Phase B end-to-end testing we observed Inngest's `retries: 3`
re-running the **agent step** four times (initial + 3 retries) when an Anthropic 400 error
recurred. Each retry consumed full token budget for the system prompt (~17k tokens One
Pager, much larger for Pitch Deck). For a real production run this could be **$5–$8 in
wasted tokens per failed run** when the failure is non-retryable by definition.

Two fixes, both deferred from Phase B and tracked here so they don't get lost:

#### Fix 1 — Lower agent-step retries to 1 (DROPPED — not supported by Inngest v3)

**Status:** Attempted and reverted on 2026-05-02. Inngest v3's `StepOptions` interface
only exposes `id` and `name` — there is no per-step `retries` override. Setting
`step.run(id, { retries: 1 }, fn)` is a TS error, not just typing — the runtime field
is unrecognized.

**Resolution:** Fix 2 below (4xx as NonRetriableError) makes Fix 1 unnecessary in
practice. The retry burn we observed in Phase B was caused by a *consistent* Anthropic
400 (stale code with a malformed JSON schema). With Fix 2 in place, those 400s are
caught and stop after the first attempt. Transient 5xx errors are non-recurring by
definition, so the function-level `retries: 3` doesn't compound costs in normal
operation. **No code change required for Fix 1.**

If Inngest later ships per-step retries (https://github.com/inngest/inngest-js/issues — search
"per-step retries"), revisit this and apply it for defense-in-depth on the most
expensive step.

#### Fix 2 — Mark Anthropic 4xx errors as non-retryable in the wrapper

Inngest treats any thrown error as retryable unless it inherits from `NonRetriableError`
(`import { NonRetriableError } from 'inngest'`). 4xx errors from Anthropic mean the
request itself is malformed or the prompt violates policy — retrying with the same
inputs will produce the same 400. Burns tokens, never succeeds.

In `agents-service/src/lib/anthropic-client.ts`, wrap the `anthropic.messages.create`
call so SDK-thrown 4xx errors bubble as `NonRetriableError`:

```ts
import { NonRetriableError } from 'inngest';
import Anthropic from '@anthropic-ai/sdk';

// ... inside callAgentWithStructuredOutput, around the create call:
let response;
try {
  response = await anthropic.messages.create({ ...request });
} catch (err) {
  if (err instanceof Anthropic.APIError && err.status >= 400 && err.status < 500) {
    throw new NonRetriableError(
      `Anthropic ${err.status} (non-retryable): ${err.message}`,
      { cause: err }
    );
  }
  throw err; // 5xx, network errors → let Inngest retry
}
```

#### Steps

- [x] **Step 1:** ~~Add per-step retries override~~ — dropped (Inngest v3 limitation).
      Replaced with a comment in `one-pager.ts` explaining why Fix 1 is N/A.
- [x] **Step 2:** Import `NonRetriableError` from `inngest` and wrap the Anthropic call
      in `anthropic-client.ts`. Catch `Anthropic.APIError` with `status >= 400 && < 500`,
      rethrow as `NonRetriableError(... , { cause: err })`. Let other errors propagate.
- [x] **Step 3:** Two new unit tests in `tests/lib/anthropic-client.test.ts`:
      - `throws NonRetriableError when Anthropic returns 4xx (non-retryable)` — mocks
        a 400 from `messages.create`, asserts the throw is a `NonRetriableError`.
      - `lets 5xx errors propagate (retryable)` — mocks a 503, asserts the throw is
        the original APIError, NOT a NonRetriableError.
- [ ] **Step 4:** Deploy: `fly deploy . --config agents-service/fly.toml` (from project root).
- [ ] **Step 5:** Verify by sending an event whose ticker triggers a deliberate schema
      mismatch in the agent runner; Inngest dashboard should show the run fail with
      **0 retries** on the agent step instead of the previous 4 attempts.
- [ ] **Step 6:** Commit:
```bash
git add agents-service/src/inngest/functions/one-pager.ts \
        agents-service/src/lib/anthropic-client.ts \
        agents-service/tests/lib/anthropic-client.test.ts \
        gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md
git commit -m "perf: mark Anthropic 4xx as non-retryable (cost protection)"
```

**Expected impact:** Worst-case wasted spend on a known-bad request drops from ~$5-8 to
~$0.50 (one initial call only — same outcome as Fix 1 would have given, achieved through
Fix 2 alone since all consistent failures bottom out as 4xx). Transient 5xx still gets
the function's `retries: 3` for resilience.

---

### Task 24: Cutover decision (USER ACTION)

**Files:** None

**Why this matters:** The user decides whether to flip the production feature flag.

- [ ] **Step 1: Review Task 21 comparison findings**

If verdicts agree and quality is comparable, proceed. If verdicts differ substantially, debug v3 first — don't cut over.

- [ ] **Step 2: For initial production cutover, set the flag in production frontend build**

The frontend feature flag is read from `import.meta.env.VITE_USE_V3_ONEPAGER`. To enable in production:

In `.env.local` (or your production env file):
```
VITE_USE_V3_ONEPAGER=true
```

Then rebuild and redeploy:
```bash
npm run build && npx wrangler pages deploy dist --project-name thes1s
```

- [ ] **Step 3: Monitor the first 5 production runs**

Watch Langfuse for 1-2 hours after rollout. Look for:
- Any failed runs in Inngest "Runs" view
- Cost-per-run trending higher than expected (>$3/One-Pager is a red flag)
- Any 5xx errors in `fly logs`

- [ ] **Step 4: If everything looks clean for a week, archive v1 routes**

After ~7 days of clean v3 operation, the v1 (Managed Agents) routes can be marked deprecated. **Don't delete them yet** — you may want to roll back. Add a deprecation comment at the top of `api/src/routes/pipeline.js`:
```javascript
// DEPRECATED: v1 Managed Agents pipeline. v3 is the supported path as of <date>.
// Will be removed once Pitch Deck and Full Story migrations complete.
```

**Phase D complete. Phase 1 of the migration is done. Pitch Deck migration is the next plan.**

---

## Self-Review

Walked through the spec from Phase 0 conversations and the agents-v2 audit. Coverage:

| Spec requirement | Task |
|---|---|
| Fly.io agent service | Tasks 1-4 |
| Inngest orchestration | Tasks 5-8 |
| Langfuse tracing | Task 9 |
| Treat v2 prompts as immutable (TODOS.md exception) | Task 12 (loads from disk, no edits) |
| Anthropic SDK direct (no framework) | Task 13 |
| Prompt caching | Task 13 (cache_control on system + cacheable context) |
| JSON schema enforcement | Task 13 (forced tool-call output) + Task 11 (Zod) |
| Retry policy | Task 15 (`retries: 3`), Task 23 (per-step override + 4xx non-retryable) |
| Timeouts | Task 15 (`finish: '15m'`) |
| Web search support | Task 14 (web_search_20250305 tool) |
| Worker stays the front door | Task 17 |
| D1 for run tracking | Task 17 (v3_runs table) |
| Frontend feature flag | Task 20 |
| Side-by-side validation | Task 21 |
| Cost / token tracking via Langfuse | Task 13 (generation usage logged) |
| User never re-pastes secrets to Claude | Task 4 (user-runs-fly-secrets-set), Task 17 step 5 (user-runs-wrangler-secret-put) |
| Postpone TODOS.md prompt fixes | Out of scope — explicit non-goal |
| Cost protection on retries | Task 23 (added post-Phase B based on observed retry burn) |

No placeholders. Type names consistent (`OnePagerOutput`, `OnePagerOutputSchema`, `runOnePagerAgent` used throughout). Each task has 4-7 steps with code or commands. Commit step at end of each task. DRY — schema reuse via `ReportSectionSchema`.

Known assumption to verify at implementation time: the exact Anthropic SDK signature for `cache_control` on `TextBlockParam` may have shifted since this plan was written — adjust the call signature in Task 13 if the SDK errors. The pattern (cache_control: { type: 'ephemeral' } on content blocks) is stable; field name might shift.

---

## Execution Handoff

**Plan complete and saved to `gstack/plans/agent-pipeline-migration-onepager-eng-plan-20260502.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended for this scope)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with isolated context. Best when tasks span >5-10 tasks and you want to keep the main conversation focused.

**2. Inline Execution** — Execute tasks sequentially in this session with checkpoints for your review. Better when you want to be in the loop on every step.

**For this 23-task plan with ~5 user-action tasks (Fly secrets, Inngest sync, manual UI test, cutover decision):** I'd lean **Inline Execution with checkpoints between phases (after Task 10, 16, 20, 23)**. Reasons:
- Several tasks need *your* hands (Fly CLI, Inngest dashboard, browser testing)
- The plan is dense enough that sub-agents would lose context on cross-task references
- Review gates between phases match natural pause points

But subagent-driven is the right call if you want me to bang out Phase A (no user actions until Task 4) end-to-end while you're doing other things.

**Which approach?**
