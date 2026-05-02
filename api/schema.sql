-- Thes1s D1 Schema
-- Auth + user data + shared data (gurus, insiders, taxonomy)

-- ═══ Auth ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  used_at TEXT
);

-- ═══ User Data (per-user) ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ticker TEXT NOT NULL,
  company_name TEXT,
  current_stage INTEGER DEFAULT 1,
  stage_approvals TEXT DEFAULT '{}',
  notes TEXT DEFAULT '',
  watchlist INTEGER DEFAULT 0,
  competitors TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);

CREATE TABLE IF NOT EXISTS report_stages (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (report_id, stage)
);

CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT DEFAULT 'Default',
  tickers TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  settings TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══ Shared Data (populated by cron) ═══════════════════════════

CREATE TABLE IF NOT EXISTS guru_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guru_cik TEXT NOT NULL,
  guru_name TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  report_date TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  issuer TEXT NOT NULL,
  cusip TEXT NOT NULL,
  cusip6 TEXT NOT NULL,
  ticker TEXT,
  shares INTEGER NOT NULL,
  value_usd INTEGER NOT NULL,
  portfolio_pct REAL,
  share_type TEXT,
  action TEXT,
  shares_change INTEGER DEFAULT 0,
  pct_change REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(guru_cik, report_date, cusip)
);
CREATE INDEX IF NOT EXISTS idx_guru_ticker ON guru_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_guru_report ON guru_holdings(guru_cik, report_date);

-- ═══ Guru Health Monitoring ═══════════════════════════════════

CREATE TABLE IF NOT EXISTS guru_health (
  guru_cik TEXT PRIMARY KEY,
  guru_name TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  last_report_date TEXT,
  last_checked_at TEXT NOT NULL,
  sec_filed_name TEXT,
  status TEXT DEFAULT 'ok',
  alert_sent_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS insider_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_cik TEXT NOT NULL,
  ticker TEXT NOT NULL,
  accession_number TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_cik TEXT NOT NULL,
  is_officer INTEGER DEFAULT 0,
  is_director INTEGER DEFAULT 0,
  officer_title TEXT,
  transaction_date TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  transaction_code TEXT NOT NULL,
  is_open_market INTEGER DEFAULT 0,
  is_derivative INTEGER DEFAULT 0,
  shares REAL NOT NULL,
  price_per_share REAL,
  total_value REAL,
  shares_owned_after REAL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(accession_number, owner_cik, transaction_date, transaction_code, shares)
);
CREATE INDEX IF NOT EXISTS idx_insider_ticker ON insider_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_insider_date ON insider_trades(transaction_date);

CREATE TABLE IF NOT EXISTS company_assignments (
  cik TEXT PRIMARY KEY,
  ticker TEXT,
  name TEXT,
  sector TEXT NOT NULL,
  industry_group TEXT NOT NULL,
  industry TEXT NOT NULL,
  thes1s_code TEXT,
  sic_code TEXT,
  exchange TEXT,
  status TEXT DEFAULT 'active',
  delisted_at TEXT,
  confidence REAL DEFAULT 0.85,
  yahoo_sector TEXT,
  yahoo_industry TEXT,
  is_sp500 INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_ticker ON company_assignments(ticker);
CREATE INDEX IF NOT EXISTS idx_assignments_industry ON company_assignments(industry);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON company_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_sp500 ON company_assignments(is_sp500);

CREATE TABLE IF NOT EXISTS classification_queue (
  cik TEXT PRIMARY KEY,
  ticker TEXT,
  name TEXT,
  status TEXT DEFAULT 'pending',
  exclude_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_status (
  job_name TEXT PRIMARY KEY,
  last_run TEXT,
  last_offset INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  items_processed INTEGER DEFAULT 0,
  error TEXT
);

-- ═══ Billing & Usage Tracking ═════════════════════════════

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

-- ═══ Pipeline Runs (server-side generation tracking) ═════

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  report_id TEXT,
  ticker TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  session_id TEXT,
  current_wave INTEGER DEFAULT 0,
  total_waves INTEGER,
  progress TEXT,
  sections_json TEXT,
  data_packet_json TEXT,
  error TEXT,
  budget_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_user_status ON pipeline_runs(user_id, status);

-- Managed Agents coordinator cache
CREATE TABLE IF NOT EXISTS managed_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  prompt_hash TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ v3 pipeline runs (Inngest-orchestrated, parallel to pipeline_runs) ═════
CREATE TABLE IF NOT EXISTS v3_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
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
