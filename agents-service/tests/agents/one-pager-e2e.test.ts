import { describe, it, expect } from 'vitest';
import { runOnePagerAgent } from '../../src/agents/one-pager.js';

const RUN_E2E = process.env.RUN_E2E === '1';

describe.skipIf(!RUN_E2E)('One Pager e2e smoke', () => {
  it('produces a valid OnePager for AAPL with web search', async () => {
    const runId = `e2e-${Date.now()}`;
    const result = await runOnePagerAgent({ ticker: 'AAPL', runId });

    expect(result.ticker).toBe('AAPL');
    expect(result.companyName).toMatch(/Apple/);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(['PASS', 'FAIL', 'WATCHLIST']).toContain(result.overallVerdict);
  }, 360_000); // 6-minute timeout
});
