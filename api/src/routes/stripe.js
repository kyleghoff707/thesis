// Stripe billing routes — metered usage billing for Thes1s AI.
// Authenticated routes: /stripe/setup, /stripe/portal
// Public route: /stripe/webhook (verified by Stripe signature)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Stripe SDK helper ──────────────────────────────────────

function stripeClient(secretKey) {
  const baseUrl = 'https://api.stripe.com/v1';
  const headers = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  return {
    async post(path, params = {}) {
      const body = new URLSearchParams(params).toString();
      const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body });
      return res.json();
    },
    async get(path) {
      const res = await fetch(`${baseUrl}${path}`, { headers: { 'Authorization': headers.Authorization } });
      return res.json();
    },
  };
}

// ─── Webhook signature verification ─────────────────────────

async function verifyWebhookSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [key, value] = item.split('=');
    parts[key.trim()] = value;
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject if older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

  return expected === signature;
}

// ─── Webhook handler (public, no auth) ──────────────────────

export async function handleStripeWebhook(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const payload = await request.text();
  const sigHeader = request.headers.get('stripe-signature');

  const valid = await verifyWebhookSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'Invalid signature' }, 400);

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid payload' }, 400);
  }

  const db = env.DB;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = session.customer;
      if (!customerId) break;

      // Find user by stripe_customer_id
      const billing = await db.prepare(
        'SELECT user_id FROM billing WHERE stripe_customer_id = ?'
      ).bind(customerId).first();
      if (!billing) break;

      // Create subscription with metered price
      const stripe = stripeClient(env.STRIPE_SECRET_KEY);
      const sub = await stripe.post('/subscriptions', {
        customer: customerId,
        'items[0][price]': env.STRIPE_PRICE_ID,
      });

      if (sub.error) {
        console.warn('Stripe subscription creation failed:', sub.error.message);
        break;
      }

      const subscriptionItemId = sub.items?.data?.[0]?.id;
      await db.prepare(
        'UPDATE billing SET stripe_subscription_item_id = ?, billing_active = 1, updated_at = datetime(\'now\') WHERE user_id = ?'
      ).bind(subscriptionItemId, billing.user_id).run();
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      if (!customerId) break;

      await db.prepare(
        'UPDATE billing SET billing_active = 0, updated_at = datetime(\'now\') WHERE stripe_customer_id = ?'
      ).bind(customerId).run();
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      if (!customerId) break;

      await db.prepare(
        'UPDATE billing SET billing_active = 1, updated_at = datetime(\'now\') WHERE stripe_customer_id = ?'
      ).bind(customerId).run();
      break;
    }
  }

  return json({ received: true });
}

// ─── Authenticated Stripe routes ────────────────────────────

export async function handleStripe(request, env, path, user) {
  const method = request.method;

  // POST /stripe/setup — create Stripe customer + checkout session
  if (path === '/stripe/setup' && method === 'POST') {
    const stripe = stripeClient(env.STRIPE_SECRET_KEY);
    const db = env.DB;

    // Check if user already has a Stripe customer
    const billing = await db.prepare('SELECT stripe_customer_id FROM billing WHERE user_id = ?')
      .bind(user.id).first();

    let customerId = billing?.stripe_customer_id;

    if (!customerId) {
      // Create Stripe customer
      const customer = await stripe.post('/customers', {
        email: user.email,
        name: user.name || user.email,
        'metadata[thes1s_user_id]': user.id,
      });
      if (customer.error) return json({ error: customer.error.message }, 502);
      customerId = customer.id;

      await db.prepare(
        'UPDATE billing SET stripe_customer_id = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
      ).bind(customerId, user.id).run();
    }

    // Create checkout session in setup mode (collect payment method)
    const origin = request.headers.get('Origin') || 'https://thes1sinvesting.com';
    const session = await stripe.post('/checkout/sessions', {
      mode: 'setup',
      customer: customerId,
      'payment_method_types[0]': 'card',
      success_url: `${origin}/billing?setup=success`,
      cancel_url: `${origin}/billing?setup=cancelled`,
    });

    if (session.error) return json({ error: session.error.message }, 502);
    return json({ url: session.url });
  }

  // POST /stripe/portal — create billing portal session
  if (path === '/stripe/portal' && method === 'POST') {
    const db = env.DB;
    const billing = await db.prepare('SELECT stripe_customer_id FROM billing WHERE user_id = ?')
      .bind(user.id).first();

    if (!billing?.stripe_customer_id) {
      return json({ error: 'No billing account found. Set up billing first.' }, 404);
    }

    const stripe = stripeClient(env.STRIPE_SECRET_KEY);
    const origin = request.headers.get('Origin') || 'https://thes1sinvesting.com';
    const session = await stripe.post('/billing_portal/sessions', {
      customer: billing.stripe_customer_id,
      return_url: `${origin}/billing`,
    });

    if (session.error) return json({ error: session.error.message }, 502);
    return json({ url: session.url });
  }

  return json({ error: 'Not found' }, 404);
}
