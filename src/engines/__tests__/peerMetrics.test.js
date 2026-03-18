// ─── Peer Metrics Bug Reproduction Tests ─────────────────────────────
// These tests reproduce and verify fixes for the Competitors tab bugs:
//
// Bug 1: Balance sheet tags (Assets, Equity, etc.) are "instant" values
//         that need CY{year}Q4I period, not CY{year}. Without this,
//         all balance sheet frames return 404 → no ROE, ROIC, ROA, etc.
//
// Bug 2: fetchPeerFrameData returns early after primary tag, never tries
//         fallback tags. Companies using alternate XBRL tags get no data.
//
// Bug 3: CIK type mismatch in Competitors.jsx bestValues — string vs number.
//
// Bug 4: Some PEER_FRAMES_TAGS have wrong primary tags (e.g., CurrentAssets
//         should be AssetsCurrent as primary since that's what SEC uses).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Setup ──────────────────────────────────────────────────────

// We mock fetchFrame to control what data comes back without hitting SEC.
// The tests verify that peerMetrics.js calls fetchFrame with correct arguments
// and handles the results properly.

// Track all fetchFrame calls to verify correct URL construction
const fetchFrameCalls = [];

// Mock frame data: simulates SEC Frames API responses
function makeFrameData(entries) {
  return { data: entries.map(e => ({ cik: e.cik, entityName: e.name || '', val: e.val })) };
}

// Configurable mock responses: maps "tag:unit:CYyear" → frame data
let mockFrameResponses = {};

vi.mock('../edgarFrames', async () => {
  const actual = await vi.importActual('../edgarFrames');
  return {
    ...actual,
    fetchFrame: vi.fn(async (tag, unit, cyYear) => {
      fetchFrameCalls.push({ tag, unit, cyYear });
      const key = `${tag}:${unit}:${cyYear}`;
      return mockFrameResponses[key] || null;
    }),
  };
});

vi.mock('../cache', () => ({
  cacheGet: () => null,
  cacheGetAsync: async () => null,
  cacheSet: () => {},
}));

vi.mock('../ruleOneScore', () => ({
  computeMoatScore: (growthRates) => ({ moatScore: 50 }),
  computeManagementScore: (returnAverages, debtMetrics) => ({ managementScore: 50 }),
  computeRuleOneScore: (moat, mgmt) => Math.round((moat + mgmt) / 2),
}));

import { fetchPeerFrameData, computePeerMetrics } from '../peerMetrics';
import { FRAMES_TAGS, PEER_FRAMES_TAGS } from '../edgarFrames';

beforeEach(() => {
  fetchFrameCalls.length = 0;
  mockFrameResponses = {};
  vi.clearAllMocks();
});

// ─── Bug 1: Balance sheet tags need instant period (Q4I) ─────────────

describe('Bug 1: Balance sheet tags need CY{year}Q4I period', () => {
  it('should identify which tags are instant (balance sheet) vs duration (income statement)', () => {
    // These tags are balance sheet items (point-in-time) and MUST use CY{year}Q4I:
    const instantTags = [
      'Assets', 'StockholdersEquity', 'Liabilities', 'LongTermDebtNoncurrent',
      'LongTermDebt', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
      'AssetsCurrent', 'LiabilitiesCurrent', 'CurrentAssets', 'CurrentLiabilities',
      'InventoryNet', 'Inventory',
      'CashAndCashEquivalentsAtCarryingValue', 'Cash', 'CashCashEquivalentsAndShortTermInvestments',
      'CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding',
    ];

    // These tags are income statement items (period/duration) and use CY{year}:
    const durationTags = [
      'Revenues', 'NetIncomeLoss', 'GrossProfit', 'OperatingIncomeLoss',
      'NetCashProvidedByUsedInOperatingActivities', 'PaymentsToAcquirePropertyPlantAndEquipment',
      'IncomeTaxExpenseBenefit',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
      'PaymentsToAcquireProductiveAssets',
      'EarningsPerShareDiluted', // duration (per-share over a period), though no Frames endpoint exists
      'EarningsPerShareBasic', // fallback for EarningsPerShareDiluted
      'CurrentIncomeTaxExpenseBenefit', // fallback for IncomeTaxExpenseBenefit
      'CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', // derived metric building blocks
      'CostsAndExpenses', 'OperatingExpenses', // derived metric building blocks
    ];

    // Every tag in PEER_FRAMES_TAGS (and its fallbacks) should be classifiable
    for (const def of PEER_FRAMES_TAGS) {
      const allTags = [def.tag, ...def.fallbacks];
      for (const tag of allTags) {
        const isInstant = instantTags.includes(tag);
        const isDuration = durationTags.includes(tag);
        // Each tag must be one or the other — we need to know which period to use
        expect(
          isInstant || isDuration,
          `Tag "${tag}" (from ${def.ourField}) is not classified as instant or duration`
        ).toBe(true);
      }
    }
  });

  it('PEER_FRAMES_TAGS should have a period property distinguishing instant from duration', () => {
    // After the fix, each tag definition should have a `period` field
    for (const def of PEER_FRAMES_TAGS) {
      expect(
        def.period,
        `Tag definition for ${def.ourField} (${def.tag}) is missing 'period' property. ` +
        `Should be 'instant' for balance sheet items or 'duration' for income statement items.`
      ).toBeDefined();
      expect(['instant', 'duration']).toContain(def.period);
    }
  });

  it('fetchPeerFrameData should pass correct cyYear format based on period type', async () => {
    const peerCIKs = new Set(['0000001234']);
    const year = 2024;

    // Set up mock responses for both duration and instant tags
    // Duration tags: CY2024
    mockFrameResponses['Revenues:USD:2024'] = makeFrameData([{ cik: 1234, val: 1000000 }]);
    mockFrameResponses['NetIncomeLoss:USD:2024'] = makeFrameData([{ cik: 1234, val: 100000 }]);
    // Instant tags: CY2024Q4I (after fix)
    mockFrameResponses['Assets:USD:2024Q4I'] = makeFrameData([{ cik: 1234, val: 5000000 }]);
    mockFrameResponses['StockholdersEquity:USD:2024Q4I'] = makeFrameData([{ cik: 1234, val: 2000000 }]);

    const result = await fetchPeerFrameData(peerCIKs, year);

    // Verify that fetchFrame was called with Q4I suffix for balance sheet tags
    const assetsCalls = fetchFrameCalls.filter(c => c.tag === 'Assets');
    const revenueCalls = fetchFrameCalls.filter(c => c.tag === 'Revenues');

    expect(revenueCalls.length).toBeGreaterThan(0);
    expect(revenueCalls[0].cyYear).toBe(2024); // Duration: plain year

    expect(assetsCalls.length).toBeGreaterThan(0);
    expect(assetsCalls[0].cyYear).toBe('2024Q4I'); // Instant: needs Q4I suffix

    // Verify data was actually populated
    const peerData = result.get(1234);
    expect(peerData).toBeDefined();
    expect(peerData.revenues).toBe(1000000);
    expect(peerData.assets).toBe(5000000);
    expect(peerData.equity).toBe(2000000);
  });
});

// ─── Bug 2: Fallback tags skipped due to premature return ────────────

describe('Bug 2: Fallback tags must be tried when primary tag misses CIKs', () => {
  it('should try fallback tags when a peer CIK is missing from primary tag frame', async () => {
    const peerCIKs = new Set(['0000001111', '0000002222']);
    const year = 2024;

    // Company 1111 reports as "Revenues", Company 2222 reports as fallback tag
    mockFrameResponses['Revenues:USD:2024'] = makeFrameData([
      { cik: 1111, val: 5000000 },
      // Note: 2222 is NOT in the Revenues frame
    ]);
    mockFrameResponses['RevenueFromContractWithCustomerExcludingAssessedTax:USD:2024'] = makeFrameData([
      { cik: 2222, val: 3000000 },
    ]);

    // Also set up a non-revenue tag so both CIKs have some data
    mockFrameResponses['NetIncomeLoss:USD:2024'] = makeFrameData([
      { cik: 1111, val: 500000 },
      { cik: 2222, val: 300000 },
    ]);

    const result = await fetchPeerFrameData(peerCIKs, year);

    // Both companies should have revenue data
    const peer1 = result.get(1111);
    const peer2 = result.get(2222);

    expect(peer1).toBeDefined();
    expect(peer1.revenues).toBe(5000000);

    // THIS IS THE BUG: peer2's revenue is null because the fallback was never tried
    expect(peer2).toBeDefined();
    expect(
      peer2.revenues,
      'Company 2222 should have revenue from fallback tag ' +
      'RevenueFromContractWithCustomerExcludingAssessedTax, ' +
      'but fetchPeerFrameData returned early after primary tag "Revenues" had data'
    ).toBe(3000000);
  });

  it('should not re-fetch fallbacks if all peer CIKs already have data from primary', async () => {
    const peerCIKs = new Set(['0000001111']);
    const year = 2024;

    // Primary tag has data for all peers
    mockFrameResponses['Revenues:USD:2024'] = makeFrameData([
      { cik: 1111, val: 5000000 },
    ]);
    mockFrameResponses['RevenueFromContractWithCustomerExcludingAssessedTax:USD:2024'] = makeFrameData([
      { cik: 1111, val: 5000000 },
    ]);

    await fetchPeerFrameData(peerCIKs, year);

    // The fallback tag should NOT be fetched since primary covered all CIKs
    const fallbackCalls = fetchFrameCalls.filter(
      c => c.tag === 'RevenueFromContractWithCustomerExcludingAssessedTax'
    );
    expect(fallbackCalls.length).toBe(0);
  });
});

// ─── Bug 3: computePeerMetrics with full data ────────────────────────

describe('computePeerMetrics produces correct derived values', () => {
  it('should compute ROE, ROIC, ROA, margins, FCF, and debt ratios', () => {
    const frameData = new Map();
    frameData.set(1234, {
      revenues: 10000000,
      net_income_loss: 1500000,
      equity: 5000000,
      assets: 20000000,
      liabilities: 15000000,
      long_term_debt: 3000000,
      net_cash_flow_from_operating_activities: 2000000,
      capital_expenditures: 500000,
      gross_profit: 6000000,
      operating_income: 2500000,
      current_assets: 8000000,
      current_liabilities: 4000000,
      inventory: 1000000,
      cash: 2000000,
      income_tax: 400000,
    });

    const metrics = computePeerMetrics(frameData);
    const m = metrics.get(1234);

    expect(m).toBeDefined();

    // FCF = OpCF - |CapEx|
    expect(m.fcf).toBe(1500000); // 2000000 - 500000

    // Margins
    expect(m.grossMargin).toBeCloseTo(0.6); // 6M / 10M
    expect(m.netMargin).toBeCloseTo(0.15); // 1.5M / 10M
    expect(m.operatingMargin).toBeCloseTo(0.25); // 2.5M / 10M

    // Returns
    expect(m.roe).toBeCloseTo(0.3); // 1.5M / 5M
    expect(m.roic).toBeCloseTo(0.1875); // 1.5M / (5M + 3M)
    expect(m.roa).toBeCloseTo(0.075); // 1.5M / 20M

    // Ratios
    expect(m.fcfRatio).toBeCloseTo(1.0); // 1.5M / 1.5M
    expect(m.quickRatio).toBeCloseTo(1.75); // (8M - 1M) / 4M

    // Debt metrics
    // netDebt = ltDebt - cash = 3M - 2M = 1M
    expect(m.netDebtToEarnings).toBeCloseTo(0.667, 2); // 1M / 1.5M
    expect(m.netDebtToFCF).toBeCloseTo(0.667, 2); // 1M / 1.5M
  });

  it('should handle missing fields gracefully (null, not NaN or errors)', () => {
    const frameData = new Map();
    frameData.set(5678, {
      revenues: 10000000,
      net_income_loss: 1500000,
      // Everything else missing
    });

    const metrics = computePeerMetrics(frameData);
    const m = metrics.get(5678);

    expect(m).toBeDefined();
    expect(m.fcf).toBeNull(); // No opCF or capEx
    expect(m.grossMargin).toBeNull(); // No gross_profit
    expect(m.roe).toBeNull(); // No equity
    expect(m.roic).toBeNull(); // No equity or debt
    expect(m.roa).toBeNull(); // No assets
    expect(m.quickRatio).toBeNull(); // No current_assets/liabilities
  });
});

// ─── Bug 4: Tag definitions should use correct primary tags ──────────

describe('PEER_FRAMES_TAGS uses correct primary tag names', () => {
  it('should use AssetsCurrent not CurrentAssets as primary (SEC uses AssetsCurrent)', () => {
    const currentAssetsTag = PEER_FRAMES_TAGS.find(t => t.ourField === 'current_assets');
    expect(currentAssetsTag).toBeDefined();
    // AssetsCurrent is the tag that exists in SEC Frames API, not CurrentAssets
    expect(currentAssetsTag.tag).toBe('AssetsCurrent');
  });

  it('should use LiabilitiesCurrent not CurrentLiabilities as primary', () => {
    const currentLiabTag = PEER_FRAMES_TAGS.find(t => t.ourField === 'current_liabilities');
    expect(currentLiabTag).toBeDefined();
    expect(currentLiabTag.tag).toBe('LiabilitiesCurrent');
  });
});
