import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshTaxonomy } from '../src/cron/taxonomy.js';

// Mock yahoo-finance2 (imported dynamically by lib/yahoo.js)
vi.mock('yahoo-finance2', () => {
  const mockQuoteSummary = vi.fn();
  return {
    default: class YahooFinance {
      constructor() {}
      quoteSummary = mockQuoteSummary;
    },
    _mockQuoteSummary: mockQuoteSummary,
  };
});

// Helper to build a mock D1 environment
function createMockEnv(options = {}) {
  const {
    existingCompanies = [],
    queueRows = [],
    sp500Tickers = [],
    syncStatus = null,
  } = options;

  const tables = {
    company_assignments: [...existingCompanies],
    classification_queue: [...queueRows],
    sync_status: syncStatus ? [syncStatus] : [],
  };

  const preparedStatements = [];

  const env = {
    SEC_USER_AGENT: 'Test/1.0',
    DB: {
      prepare: vi.fn((sql) => {
        const stmt = {
          sql,
          _bindings: [],
          bind: vi.fn((...args) => {
            stmt._bindings = args;
            return stmt;
          }),
          all: vi.fn(async () => {
            // Route based on SQL content
            if (sql.includes('FROM company_assignments') && !sql.includes('INSERT') && !sql.includes('UPDATE')) {
              if (sql.includes('is_sp500 = 1')) {
                return { results: tables.company_assignments.filter(r => r.is_sp500 === 1) };
              }
              if (sql.includes("status = 'active'") && sql.includes('ORDER BY updated_at')) {
                return { results: tables.company_assignments.filter(r => r.status === 'active').slice(0, 10) };
              }
              return { results: tables.company_assignments };
            }
            if (sql.includes('FROM classification_queue') && !sql.includes('INSERT') && !sql.includes('UPDATE')) {
              if (sql.includes("status = 'pending'")) {
                return { results: tables.classification_queue.filter(r => r.status === 'pending') };
              }
              if (sql.includes("status = 'excluded'")) {
                return { results: tables.classification_queue.filter(r => r.status === 'excluded') };
              }
              return { results: tables.classification_queue };
            }
            if (sql.includes('FROM sync_status')) {
              return { results: tables.sync_status };
            }
            return { results: [] };
          }),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
          first: vi.fn(async () => null),
        };
        preparedStatements.push(stmt);
        return stmt;
      }),
    },
    _tables: tables,
    _statements: preparedStatements,
  };

  return env;
}

// Mock global fetch for SEC and Wikipedia
function mockFetch(responses = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url) => {
    if (url.includes('sec.gov/files/company_tickers.json')) {
      return {
        ok: true,
        json: async () => responses.sec || {
          '0': { cik_str: '1045810', ticker: 'NVDA', title: 'NVIDIA CORP' },
          '1': { cik_str: '320193', ticker: 'AAPL', title: 'APPLE INC' },
        },
      };
    }
    if (url.includes('wikipedia.org')) {
      return {
        ok: true,
        text: async () => responses.wikipedia || '<table class="wikitable"><tr><td><a>AAPL</a></td></tr><tr><td><a>NVDA</a></td></tr></table>',
      };
    }
    return { ok: false, status: 404 };
  });
  return () => { globalThis.fetch = original; };
}

describe('taxonomy refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Phase 1: aborts gracefully on SEC fetch failure', async () => {
    const env = createMockEnv();
    const restore = mockFetch();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503 }));

    await refreshTaxonomy(env);

    // Should write error to sync_status
    const syncWrites = env._statements.filter(s => s.sql.includes('sync_status') && s.sql.includes('INSERT'));
    expect(syncWrites.length).toBeGreaterThan(0);
    expect(syncWrites[0]._bindings).toContain('error');

    restore();
  });

  it('Phase 2: detects ticker changes', async () => {
    const env = createMockEnv({
      existingCompanies: [
        { cik: '0001045810', ticker: 'OLD_NVDA', name: 'NVIDIA CORP', status: 'active' },
      ],
    });
    const restore = mockFetch({
      sec: {
        '0': { cik_str: '1045810', ticker: 'NVDA', title: 'NVIDIA CORP' },
      },
    });

    await refreshTaxonomy(env);

    // Should have issued an UPDATE for the ticker change
    const updates = env._statements.filter(s =>
      s.sql.includes('UPDATE company_assignments') &&
      s.sql.includes('ticker = ?')
    );
    expect(updates.length).toBeGreaterThan(0);

    restore();
  });

  it('Phase 3: queues new CIKs not in D1 or queue', async () => {
    const env = createMockEnv({
      existingCompanies: [
        { cik: '0000320193', ticker: 'AAPL', name: 'APPLE INC', status: 'active' },
      ],
      // NVDA is not in either table — should be queued
    });
    const restore = mockFetch({
      sec: {
        '0': { cik_str: '1045810', ticker: 'NVDA', title: 'NVIDIA CORP' },
        '1': { cik_str: '320193', ticker: 'AAPL', title: 'APPLE INC' },
      },
    });

    await refreshTaxonomy(env);

    // Should have inserted NVDA into classification_queue
    const inserts = env._statements.filter(s =>
      s.sql.includes('INSERT') && s.sql.includes('classification_queue')
    );
    expect(inserts.length).toBeGreaterThan(0);

    restore();
  });

  it('Phase 4: skips S&P 500 update when fewer than 400 tickers parsed', async () => {
    const env = createMockEnv();
    const restore = mockFetch({
      // Only 2 tickers in the wikitable — should trigger the < 400 sanity check
      wikipedia: '<table class="wikitable"><tr><td><a>AAPL</a></td></tr><tr><td><a>NVDA</a></td></tr></table>',
    });

    await refreshTaxonomy(env);

    // Should NOT have issued any is_sp500 updates
    const sp500Updates = env._statements.filter(s =>
      s.sql.includes('is_sp500') && s.sql.includes('UPDATE')
    );
    expect(sp500Updates.length).toBe(0);

    restore();
  });

  it('Phase 5: detects delisting when Yahoo returns no quoteType', async () => {
    const env = createMockEnv({
      existingCompanies: [
        { cik: '0000123456', ticker: 'DEAD', yahoo_sector: 'Technology', yahoo_industry: 'Software', status: 'active' },
      ],
    });
    const restore = mockFetch();

    // Mock yahoo-finance2 to return no quoteType (delisted)
    const { _mockQuoteSummary } = await import('yahoo-finance2');
    _mockQuoteSummary.mockResolvedValueOnce({
      assetProfile: { sector: 'Technology', industry: 'Software' },
      price: { quoteType: null, exchange: null },
    });

    await refreshTaxonomy(env);

    // Should have marked as delisted
    const delistUpdates = env._statements.filter(s =>
      s.sql.includes('UPDATE company_assignments') && s.sql.includes('delisted')
    );
    expect(delistUpdates.length).toBeGreaterThan(0);

    restore();
  });

  it('Phase 5: detects reclassification when Yahoo industry differs', async () => {
    const env = createMockEnv({
      existingCompanies: [
        { cik: '0000654321', ticker: 'META', yahoo_sector: 'Communication Services', yahoo_industry: 'Internet Content & Information', status: 'active' },
      ],
    });
    const restore = mockFetch();

    const { _mockQuoteSummary } = await import('yahoo-finance2');
    _mockQuoteSummary.mockResolvedValueOnce({
      assetProfile: { sector: 'Technology', industry: 'Software - Application' },
      price: { quoteType: 'EQUITY', exchange: 'NMS' },
    });

    await refreshTaxonomy(env);

    // Should have updated the classification
    const reclassUpdates = env._statements.filter(s =>
      s.sql.includes('UPDATE company_assignments') &&
      s.sql.includes('sector = ?') &&
      s.sql.includes('industry = ?')
    );
    expect(reclassUpdates.length).toBeGreaterThan(0);

    restore();
  });
});
