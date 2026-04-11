// Claude API proxy — forwards browser requests to Anthropic with server-side API key.
// Tracks per-user token usage and cost in D1. Reports usage to Stripe.
// Uses pending-row pattern for race-safe spending caps.

import { MODEL_PRICING, normalizeModel, calculateCostMillicents } from '../../../packages/pricing/index.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Spending cap check ─────────────────────────────────────

async function checkSpendingCap(db, userId) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().replace('T', ' ').slice(0, 19);

  // Get billing config
  const billing = await db.prepare(
    'SELECT monthly_limit_cents, billing_active, stripe_subscription_item_id FROM billing WHERE user_id = ?'
  ).bind(userId).first();

  // Sum current month spend (completed + recent pending, ignore stale pending)
  const usage = await db.prepare(`
    SELECT COALESCE(SUM(cost_millicents), 0) as total_millicents
    FROM api_usage
    WHERE user_id = ? AND created_at >= ?
    AND (status = 'completed' OR (status = 'pending' AND created_at > datetime('now', '-30 minutes')))
  `).bind(userId, monthStartStr).first();

  return {
    billing: billing || { monthly_limit_cents: 5000, billing_active: 0, stripe_subscription_item_id: null },
    currentSpendMillicents: usage?.total_millicents || 0,
  };
}

// ─── SSE usage extraction ───────────────────────────────────

function createUsageExtractingStream() {
  let buffer = '';
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    web_searches: 0,
  };
  let isStreaming = false;

  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      const text = new TextDecoder().decode(chunk, { stream: true });
      buffer += text;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          isStreaming = true;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const data = JSON.parse(dataStr);
            // message_start contains input token counts
            if (data.type === 'message_start' && data.message?.usage) {
              usage.input_tokens = data.message.usage.input_tokens || 0;
              usage.cache_read_input_tokens = data.message.usage.cache_read_input_tokens || 0;
              usage.cache_creation_input_tokens = data.message.usage.cache_creation_input_tokens || 0;
            }
            // message_delta contains output token counts
            if (data.type === 'message_delta' && data.usage) {
              usage.output_tokens = data.usage.output_tokens || 0;
            }
            // Track web search tool uses
            if (data.type === 'content_block_start' && data.content_block?.type === 'server_tool_use' && data.content_block?.name === 'web_search') {
              usage.web_searches++;
            }
          } catch { /* partial JSON, skip */ }
        }
      }
    },
    flush() {
      // Process any remaining buffer for non-streaming JSON responses
      if (!isStreaming && buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.usage) {
            usage.input_tokens = data.usage.input_tokens || 0;
            usage.output_tokens = data.usage.output_tokens || 0;
            usage.cache_read_input_tokens = data.usage.cache_read_input_tokens || 0;
            usage.cache_creation_input_tokens = data.usage.cache_creation_input_tokens || 0;
          }
          if (data.usage?.server_tool_use?.web_search_requests) {
            usage.web_searches = data.usage.server_tool_use.web_search_requests;
          }
        } catch { /* not JSON, skip */ }
      }
    },
  });

  return { readable, writable, usage };
}

// ─── D1 usage logging with retry ────────────────────────────

async function logUsage(db, rowId, model, usage, costMillicents) {
  const sql = `
    UPDATE api_usage
    SET model = ?, input_tokens = ?, output_tokens = ?,
        cache_read_tokens = ?, cache_write_tokens = ?,
        web_searches = ?, cost_millicents = ?, status = 'completed'
    WHERE id = ?
  `;
  const params = [
    model,
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_read_input_tokens,
    usage.cache_creation_input_tokens,
    usage.web_searches,
    costMillicents,
    rowId,
  ];

  try {
    await db.prepare(sql).bind(...params).run();
  } catch (err) {
    // Retry once after 500ms
    await new Promise(r => setTimeout(r, 500));
    try {
      await db.prepare(sql).bind(...params).run();
    } catch (retryErr) {
      console.warn('D1 usage UPDATE failed after retry:', retryErr.message,
        JSON.stringify({ rowId, model, usage, costMillicents }));
    }
  }
}

// ─── Main handler ───────────────────────────────────────────

export async function handleClaude(request, env, ctx, user) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const model = body.model || 'claude-sonnet-4-6';
  const isAdmin = user.role === 'admin';

  // Estimate cost for pending row
  const normalized = normalizeModel(model);
  const estimatedMillicents = normalized.includes('opus') ? 2500 : 1000;

  // Insert pending row
  const caller = request.headers.get('x-claude-caller') || null;
  const ticker = request.headers.get('x-claude-ticker') || null;

  let pendingRowId;
  try {
    const result = await env.DB.prepare(`
      INSERT INTO api_usage (user_id, model, cost_millicents, status, caller, ticker)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).bind(user.id, model, estimatedMillicents, caller, ticker).run();
    pendingRowId = result.meta?.last_row_id;
  } catch (err) {
    console.warn('Failed to insert pending row:', err.message);
    // If we can't insert, proceed without tracking (don't block the user)
    pendingRowId = null;
  }

  // Spending cap check (admin bypasses)
  if (!isAdmin) {
    const { billing, currentSpendMillicents } = await checkSpendingCap(env.DB, user.id);

    if (!billing.billing_active) {
      // Clean up pending row
      if (pendingRowId) {
        await env.DB.prepare('DELETE FROM api_usage WHERE id = ?').bind(pendingRowId).run();
      }
      return json({ error: 'Billing not active. Set up billing to run analyses.' }, 402);
    }

    const limitMillicents = billing.monthly_limit_cents * 10;
    if (currentSpendMillicents >= limitMillicents) {
      // Clean up pending row
      if (pendingRowId) {
        await env.DB.prepare('DELETE FROM api_usage WHERE id = ?').bind(pendingRowId).run();
      }
      const limitDollars = (billing.monthly_limit_cents / 100).toFixed(2);
      const resetDate = new Date();
      resetDate.setUTCMonth(resetDate.getUTCMonth() + 1, 1);
      const resetStr = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      return json({
        error: `Monthly AI budget reached ($${limitDollars}). Resets ${resetStr}. Contact admin to increase your limit.`,
      }, 429);
    }
  }

  // Build upstream request headers
  const upstreamHeaders = {
    'x-api-key': env.ANTHROPIC_API_KEY,
    'content-type': 'application/json',
  };
  const anthropicVersion = request.headers.get('anthropic-version');
  if (anthropicVersion) upstreamHeaders['anthropic-version'] = anthropicVersion;
  const anthropicBeta = request.headers.get('anthropic-beta');
  if (anthropicBeta) upstreamHeaders['anthropic-beta'] = anthropicBeta;

  // Forward to Anthropic
  let upstreamResponse;
  try {
    upstreamResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network error — mark pending row as failed
    if (pendingRowId) {
      await env.DB.prepare("UPDATE api_usage SET status = 'failed', cost_millicents = 0 WHERE id = ?")
        .bind(pendingRowId).run();
    }
    return json({ error: 'Failed to reach Anthropic API' }, 502);
  }

  // If Anthropic returned an error, forward it and clean up
  if (!upstreamResponse.ok) {
    if (pendingRowId) {
      await env.DB.prepare("UPDATE api_usage SET status = 'failed', cost_millicents = 0 WHERE id = ?")
        .bind(pendingRowId).run();
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: { 'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json' },
    });
  }

  // Stream response through TransformStream to extract usage.
  // The usage object is populated by the transform as chunks flow through.
  // The pipePromise resolves when the stream finishes, then we log to D1.
  const { readable, writable, usage } = createUsageExtractingStream();

  // Pipe upstream → TransformStream. Client reads from readable side.
  const pipePromise = upstreamResponse.body.pipeTo(writable).catch(() => {});

  // Log usage async after stream completes
  if (pendingRowId) {
    ctx.waitUntil((async () => {
      await pipePromise;

      const costMillicents = calculateCostMillicents(usage, model);
      await logUsage(env.DB, pendingRowId, model, usage, costMillicents);

      // Report to Stripe via Meter Events API
      const billing = await env.DB.prepare(
        'SELECT stripe_customer_id FROM billing WHERE user_id = ?'
      ).bind(user.id).first();
      if (billing?.stripe_customer_id && env.STRIPE_SECRET_KEY && env.STRIPE_METER_EVENT_NAME) {
        const costCents = Math.max(1, Math.round(costMillicents / 10));
        try {
          await fetch('https://api.stripe.com/v1/billing/meter_events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              event_name: env.STRIPE_METER_EVENT_NAME,
              'payload[stripe_customer_id]': billing.stripe_customer_id,
              'payload[value]': String(costCents),
              timestamp: String(Math.floor(Date.now() / 1000)),
            }).toString(),
          });
        } catch (stripeErr) {
          console.warn('Stripe meter event failed:', stripeErr.message);
        }
      }
    })());
  }

  // Return the readable stream to the client
  const responseHeaders = {
    'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json',
  };
  const cacheControl = upstreamResponse.headers.get('Cache-Control');
  if (cacheControl) responseHeaders['Cache-Control'] = cacheControl;

  return new Response(readable, {
    status: 200,
    headers: responseHeaders,
  });
}
