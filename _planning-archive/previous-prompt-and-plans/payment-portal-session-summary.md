# Payment Portal Session Summary

**Date:** 2026-04-09 to 2026-04-10
**Status:** Partially deployed, paused for pipeline debugging
**Plan file:** `~/.claude/plans/optimized-doodling-bunny.md`

## What we were trying to do

Build a payment portal so family members can use Thes1s without running up Kyle's personal Claude API bill. The system tracks per-user AI usage and charges them exactly what they use (no markup) via Stripe metered billing. Monthly spending caps prevent runaway costs.

## What we built

### Backend (Cloudflare Worker)

**New files:**
- `api/src/routes/claude.js` — Claude API proxy. Browser sends requests here instead of directly to Anthropic. The Worker injects the real API key (stored as a secret), forwards the request, and extracts token usage from the streaming response via a TransformStream. Logs usage to D1 with a pending-row pattern for race-safe spending caps. Reports usage to Stripe via Meter Events API.
- `api/src/routes/stripe.js` — Stripe integration. Checkout session creation (collect payment method), webhook handler (HMAC signature verification via crypto.subtle), billing portal session creation. Webhook handles checkout.session.completed, invoice.paid, invoice.payment_failed.
- `api/migration-billing.sql` — Migration script that was run against production D1.

**Modified files:**
- `api/schema.sql` — Added `api_usage` table (per-request token/cost tracking with status column for pending-row pattern) and `billing` table (per-user spending limits + Stripe IDs).
- `api/src/index.js` — Wired claude proxy, stripe webhook (unauthenticated), and stripe routes (authenticated). Updated CORS to allow Anthropic SDK headers. User later restructured to move proxy/data routes to public block.
- `api/src/routes/auth.js` — Billing row created at signup. Admin gets billing_active=1 with no limit. Non-admin gets billing_active=0 with $50 limit.
- `api/src/routes/user.js` — Added GET /user/billing (current month spend + limit), GET /user/usage (recent request history), PUT /user/billing/limit (admin adjusts limits).
- `api/wrangler.toml` — Added STRIPE_PRICE_ID and STRIPE_METER_EVENT_NAME vars. User added observability section.

### Shared Package

- `packages/pricing/index.js` — Single source of truth for Claude model pricing. Exports MODEL_PRICING, normalizeModel() (handles version-specific model IDs like claude-sonnet-4-20250514), and calculateCostMillicents() (tenths of a cent for precision).

### Frontend

**New files:**
- `src/components/BillingPage.jsx` — Full billing dashboard at /billing route. Summary card with spend/limit/progress bar, recent activity table, welcome card for new users, collapsible admin section showing all users.
- `src/hooks/useUsage.js` — Hooks for fetching billing status and usage history.

**Modified files:**
- `src/engines/apiBase.js` — Added claudeBaseUrl() function. Dev calls Anthropic directly, prod goes through Worker proxy.
- `src/engines/aiResearch.js` — SDK client now uses claudeBaseUrl() as baseURL. In prod, sends credentials:'include' for session cookie auth and x-claude-caller header for tracking. Imports pricing from shared package.
- `src/engines/onePagerGenerator.js` — Same proxy pattern as aiResearch. Cost calculation now uses shared pricing instead of hardcoded values.
- `src/engines/deepDive.js` — Raw fetch URL swapped to claudeBaseUrl(). Dev/prod header branching.
- `src/engines/companyAdapter.js` — Same pattern as deepDive.
- `src/engines/contextBudget.js` — MODEL_PRICING and normalizeModel re-exported from shared package. computeCost uses normalizeModel.
- `src/components/Layout.jsx` — "Usage & Billing" added to user avatar dropdown menu.
- `src/App.jsx` — /billing route added, BillingPage imported.

### Tests updated
- `src/engines/__tests__/contextBudget.test.js` — Updated for shared pricing imports. Added normalizeModel tests. Removed specific-version model ID key test (now handled by normalizeModel).

## What's deployed to production

- D1 migration ran (api_usage + billing tables created, 14 tables total)
- Billing rows seeded for both users (Kyle=admin/active/$9999 limit, coolkyle217=user/inactive/$50 limit)
- Worker deployed with secrets: ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- Frontend deployed to Cloudflare Pages
- Billing page is visible and renders correctly at /billing

## What's broken

Pipeline generation fails after the migration. The proxy itself may be fine — the issue could be in how the frontend SDK calls changed, CORS, streaming, or something in the index.js route restructuring. Needs /investigate debugging with `cd api && npx wrangler tail` to see what's happening at the Worker level.

## Stripe setup status (TEST MODE)

- Stripe account created: "Thes1s Investing"
- Product created: "Thes1s AI Usage" (prod_UJ8lhbLwzooafZ)
- Price: $0.01/unit, usage-based, per month (price_1TKW1QQ4VrAqDXtS0MtUDWBJ)
- Meter created: "API requests" event name: api_requests (mtr_test_61UTtxqgyDU39hVw041Q4VrAqDXtS1Pc)
- Webhook endpoint configured: https://api.thes1sinvesting.com/stripe/webhook (3 events)
- Customer portal configured (payment methods + invoice history)
- All keys are TEST MODE keys (sk_test_, whsec_)

## How billing works (for the next session)

1. User signs up via invite → billing row created (inactive)
2. User visits /billing → sees welcome card → clicks "Set up billing"
3. Frontend POSTs /stripe/setup → Worker creates Stripe Customer + Checkout Session → redirects to Stripe
4. User enters card on Stripe Checkout → Stripe sends checkout.session.completed webhook
5. Webhook handler creates Subscription with metered price → sets billing_active=1
6. User runs analysis → browser calls /proxy/claude/v1/messages (with session cookie)
7. Worker: inserts pending row → checks spending cap → forwards to Anthropic → streams response back
8. TransformStream extracts token usage from SSE events → updates pending row to completed with actual cost
9. Reports cost to Stripe via Meter Events API → Stripe auto-invoices at month end

## Important context for next session

**The pipeline is being migrated to Claude Managed Agents.** See `.thes1s/managed-agents-migration-prompt.txt` for the full migration plan. After that migration:

- Claude API calls will happen SERVER-SIDE via Managed Agents, not from the browser
- The proxy pattern we built (browser → Worker → Anthropic) may change significantly
- Usage tracking becomes EASIER because the Worker already owns the API calls
- The Stripe billing integration (meter events, webhooks, billing page) should survive the migration mostly unchanged — the billing/tracking layer is independent of where the Claude calls originate
- The pending-row spending cap pattern still applies

**Key decisions from the eng review that should carry forward:**
- cost_millicents (not cents) for precision on small API calls
- normalizeModel() handles version-specific model IDs
- Billing row created at signup, not lazily
- Admin bypasses all spending/billing gates
- D1 INSERT has 1-retry with 500ms delay for transient failures

**What still needs to happen (after pipeline debugging):**
1. Fix the pipeline generation failure (priority 1)
2. Test the full Stripe flow end-to-end (setup → analysis → usage appears in Stripe)
3. Hide "Set Up Billing" button for admin users (cosmetic)
4. Write miniflare integration tests (25 planned, see plan file)
5. Switch Stripe to live mode when ready for real billing
6. Adapt proxy/billing for Managed Agents architecture when that migration lands
