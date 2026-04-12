// Thes1s API — Cloudflare Worker
// Routes: /auth/*, /user/*, /data/*, /proxy/*, /health
// Auth: HTTP-only session cookies, invite-only signup

import { handleAuth } from './routes/auth.js';
import { handleUser } from './routes/user.js';
import { handleData } from './routes/data.js';
import { handleProxy } from './routes/proxy.js';
import { handleClaude } from './routes/claude.js';
import { handleStripeWebhook, handleStripe } from './routes/stripe.js';
import { handlePipeline } from './pipeline/routes.js';
import { handleCron } from './cron/index.js';
import { authenticate } from './middleware/auth.js';

// Re-export Durable Object class for Cloudflare binding
export { SessionEventLoop } from './pipeline/SessionEventLoop.js';

// CORS headers for the frontend.
// credentials: 'include' requires a specific origin (not *).
const ALLOWED_ORIGINS = [
  'https://thes1sinvesting.com',
  'https://www.thes1sinvesting.com',
  'https://thes1s.pages.dev',
  'http://localhost:5173',   // Vite dev
  'http://localhost:4173',   // Vite preview
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, anthropic-beta, x-claude-caller, x-claude-ticker',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function corsResponse(response, request) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(getCorsHeaders(request))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response;

      // Health check (no auth)
      if (path === '/health') {
        response = json({ status: 'ok', ts: new Date().toISOString() });
      }
      // Auth routes (no auth required)
      else if (path.startsWith('/auth/')) {
        response = await handleAuth(request, env, path);
      }
      // Stripe webhook (no auth — verified by Stripe signature)
      else if (path === '/stripe/webhook') {
        response = await handleStripeWebhook(request, env);
      }
      // Public API proxies (no auth — SEC, Yahoo, Finviz are public APIs)
      else if (path.startsWith('/proxy/') && !path.startsWith('/proxy/claude/')) {
        response = await handleProxy(request, env, path, url);
      }
      // Shared data (no auth — cron-populated D1/R2, read-only, not user-specific)
      else if (path.startsWith('/data/')) {
        response = await handleData(request, env, path);
      }
      // All other routes require authentication
      else {
        const user = await authenticate(request, env);
        if (!user) {
          response = json({ error: 'Unauthorized' }, 401);
        } else if (path.startsWith('/api/pipeline/')) {
          response = await handlePipeline(request, env, path, user);
        } else if (path.startsWith('/user/')) {
          response = await handleUser(request, env, path, user);
        } else if (path.startsWith('/proxy/claude/')) {
          response = await handleClaude(request, env, ctx, user);
        } else if (path.startsWith('/stripe/')) {
          response = await handleStripe(request, env, path, user);
        } else {
          response = json({ error: 'Not found' }, 404);
        }
      }

      return corsResponse(response, request);
    } catch (err) {
      console.error('Worker error:', err.message, err.stack);
      return corsResponse(json({ error: 'Internal server error' }, 500));
    }
  },

  async scheduled(event, env, ctx) {
    await handleCron(event, env);
  },
};
