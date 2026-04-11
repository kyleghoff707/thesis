-- Migration: add billing & usage tracking tables

CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  web_searches INTEGER NOT NULL DEFAULT 0,
  cost_millicents INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'completed',
  caller TEXT,
  ticker TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_month ON api_usage(user_id, created_at);

CREATE TABLE IF NOT EXISTS billing (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  monthly_limit_cents INTEGER NOT NULL DEFAULT 5000,
  stripe_customer_id TEXT,
  stripe_subscription_item_id TEXT,
  billing_active INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
