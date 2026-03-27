// Tests for toolbox.js — Tool definitions and executor for AI agents
// Tests valuation tools (pure computation, no API calls)

import { describe, it, expect, beforeAll } from 'vitest';

let TOOL_DEFINITIONS, executeTool, createToolExecutor;

beforeAll(async () => {
  const mod = await import('../toolbox.js');
  TOOL_DEFINITIONS = mod.TOOL_DEFINITIONS;
  executeTool = mod.executeTool;
  createToolExecutor = mod.createToolExecutor;
});

// ─── TOOL_DEFINITIONS Structure Tests ───────────────────────────

describe('TOOL_DEFINITIONS', () => {
  it('is an array with at least 10 elements', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('each tool has name (string), description (string), input_schema (object)', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.input_schema).toBe('object');
      expect(tool.input_schema).not.toBeNull();
    }
  });

  it('each input_schema has type "object"', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('each input_schema has properties object', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.input_schema.properties).toBe('object');
      expect(tool.input_schema.properties).not.toBeNull();
    }
  });

  it('each input_schema has required array', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(Array.isArray(tool.input_schema.required)).toBe(true);
    }
  });

  it('includes all core valuation tools', () => {
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('computeMOS');
    expect(names).toContain('computePBT');
    expect(names).toContain('computeTenCap');
    expect(names).toContain('computeEquityBond');
    expect(names).toContain('sensitivityTable');
  });

  it('includes data lookup tools', () => {
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('getMetric');
    expect(names).toContain('getFinancialLine');
    expect(names).toContain('computeGrowthRates');
  });

  it('includes peer, filing, and transcript tools', () => {
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('comparePeers');
    expect(names).toContain('readFilingSection');
    expect(names).toContain('getTranscriptExcerpt');
  });

  it('includes FCF helper tools', () => {
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('fcfPerShare');
    expect(names).toContain('yearsToPayback');
  });
});

// ─── executeTool Smoke Tests ────────────────────────────────────

describe('executeTool', () => {
  it('computeMOS returns object with stickerPrice and mosPrice > 0', () => {
    const result = executeTool('computeMOS', { fgr: 0.12, eps: 5.0, futurePE: 24 });
    expect(result).not.toBeNull();
    expect(typeof result.stickerPrice).toBe('number');
    expect(result.stickerPrice).toBeGreaterThan(0);
    expect(typeof result.mosPrice).toBe('number');
    expect(result.mosPrice).toBeGreaterThan(0);
  });

  it('computePBT returns object with pbtPrice', () => {
    const result = executeTool('computePBT', { fcfPerShare: 8, fgr: 0.12, targetYears: 8 });
    expect(result).not.toBeNull();
    expect(typeof result.pbtPrice).toBe('number');
    expect(result.pbtPrice).toBeGreaterThan(0);
  });

  it('computeTenCap returns object with tenCapPrice > 0', () => {
    const result = executeTool('computeTenCap', {
      operatingCashFlow: 6000000000,
      maintenanceCapEx: 2000000000,
      taxProvision: 500000000,
      sharesOutstanding: 443000000,
    });
    expect(result).not.toBeNull();
    expect(typeof result.tenCapPrice).toBe('number');
    expect(result.tenCapPrice).toBeGreaterThan(0);
  });

  it('computeEquityBond returns object with buyPrice', () => {
    const result = executeTool('computeEquityBond', {
      bvps: 25,
      roe: 0.30,
      retainedRatio: 0.80,
      historicalPE: 30,
    });
    expect(result).not.toBeNull();
    expect(typeof result.buyPrice).toBe('number');
    expect(result.buyPrice).toBeGreaterThan(0);
  });

  it('fcfPerShare returns a number', () => {
    const result = executeTool('fcfPerShare', { fcfRatio: 1.1, eps: 5.0 });
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('yearsToPayback returns a number or null', () => {
    const result = executeTool('yearsToPayback', { fcfPerShare: 8, fgr: 0.12, price: 100 });
    expect(result === null || typeof result === 'number').toBe(true);
  });

  it('throws Error for unknown tool', () => {
    expect(() => executeTool('nonexistent_tool', {})).toThrow('Unknown tool');
  });

  it('throws Error for another unknown tool', () => {
    expect(() => executeTool('doSomethingRandom', { x: 1 })).toThrow('Unknown tool');
  });
});

// ─── createToolExecutor Tests ───────────────────────────────────

describe('createToolExecutor', () => {
  it('getMetric retrieves dot-notation path from DataPacket', async () => {
    const mockPacket = {
      growthRates: { earnings: { '5yr': 12.5, '10yr': 15.0 } },
      ruleOneScore: { moat: 85, management: 78, composite: 82 },
    };
    const executor = createToolExecutor(mockPacket);
    expect(await executor('getMetric', { metric: 'growthRates.earnings.5yr' })).toBe(12.5);
  });

  it('getMetric returns undefined for missing path', async () => {
    const executor = createToolExecutor({ growthRates: {} });
    const result = await executor('getMetric', { metric: 'growthRates.earnings.5yr' });
    expect(result).toBeUndefined();
  });

  it('getFinancialLine retrieves yearly values from financials', async () => {
    const mockPacket = {
      financials: {
        years: [2024, 2023, 2022],
        income: {
          2024: { revenues: 100000, net_income_loss: 20000 },
          2023: { revenues: 90000, net_income_loss: 18000 },
          2022: { revenues: 80000, net_income_loss: 15000 },
        },
      },
    };
    const executor = createToolExecutor(mockPacket);
    const result = await executor('getFinancialLine', {
      statement: 'income',
      field: 'revenues',
    });
    expect(result).toEqual({ 2024: 100000, 2023: 90000, 2022: 80000 });
  });

  it('getFinancialLine filters by years when specified', async () => {
    const mockPacket = {
      financials: {
        years: [2024, 2023, 2022],
        income: {
          2024: { revenues: 100000 },
          2023: { revenues: 90000 },
          2022: { revenues: 80000 },
        },
      },
    };
    const executor = createToolExecutor(mockPacket);
    const result = await executor('getFinancialLine', {
      statement: 'income',
      field: 'revenues',
      years: [2024, 2023],
    });
    expect(result).toEqual({ 2024: 100000, 2023: 90000 });
  });

  it('executor still supports standalone valuation tools', async () => {
    const executor = createToolExecutor({});
    const result = await executor('computeMOS', { fgr: 0.12, eps: 5.0, futurePE: 24 });
    expect(result).not.toBeNull();
    expect(result.stickerPrice).toBeGreaterThan(0);
  });

  it('every tool in TOOL_DEFINITIONS has a corresponding handler in executeTool', () => {
    // Standalone tools should not throw "Unknown tool"
    const standaloneTools = ['computeMOS', 'computePBT', 'computeTenCap',
      'computeEquityBond', 'sensitivityTable', 'fcfPerShare', 'yearsToPayback'];

    for (const name of standaloneTools) {
      // Just verify executeTool doesn't throw "Unknown tool" —
      // it may throw for missing inputs, which is fine
      let threwUnknown = false;
      try {
        executeTool(name, {});
      } catch (err) {
        if (err.message.includes('Unknown tool')) threwUnknown = true;
      }
      expect(threwUnknown).toBe(false);
    }
  });

  it('every tool in TOOL_DEFINITIONS has a handler in createToolExecutor', async () => {
    const executor = createToolExecutor({
      financials: { years: [], income: {}, balance: {}, cashFlow: {} },
      growthRates: {},
    });

    // DataPacket-dependent tools should not throw "Unknown tool" either
    const dataTools = ['getMetric', 'getFinancialLine', 'computeGrowthRates',
      'comparePeers', 'readFilingSection', 'getTranscriptExcerpt'];

    for (const name of dataTools) {
      let threwUnknown = false;
      try {
        await executor(name, {});
      } catch (err) {
        if (err.message.includes('Unknown tool')) threwUnknown = true;
      }
      expect(threwUnknown).toBe(false);
    }
  });
});
