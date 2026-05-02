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
