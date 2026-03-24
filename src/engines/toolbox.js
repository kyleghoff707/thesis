// Toolbox — callable tool definitions and executor for AI agents
// Wraps existing engine functions as Claude tool_use compatible definitions.
//
// Two modes:
//   1. executeTool(name, input) — standalone tools (valuation, FCF helpers)
//   2. createToolExecutor(dataPacket) — returns executor with DataPacket context
//      for data-dependent tools (getMetric, getFinancialLine, etc.)

import {
  computeMOS,
  computePBT,
  computeTenCap,
  computeEquityBond,
  sensitivityTable,
  fcfPerShare,
  yearsToPayback,
} from './valuation.js';

import { computeGrowthRates } from './growthRates.js';

// ─── Tool Definitions (Claude tool_use API compatible) ──────────

export const TOOL_DEFINITIONS = [
  // ── Valuation Tools ──────────────────────────────────────────
  {
    name: 'computeMOS',
    description: 'Compute Margin of Safety buy price using Rule One method. Grows EPS at FGR for 10 years, applies Future P/E, discounts at MARR, then applies 50% MOS. Returns stickerPrice and mosPrice.',
    input_schema: {
      type: 'object',
      properties: {
        fgr: { type: 'number', description: 'Future Growth Rate as decimal (e.g., 0.12 for 12%)' },
        eps: { type: 'number', description: 'Current EPS (TTM or 3yr avg)' },
        futurePE: { type: 'number', description: 'Future P/E ratio (max 2x FGR, capped at historical high)' },
        marr: { type: 'number', description: 'Minimum Acceptable Rate of Return (default 0.15)' },
      },
      required: ['fgr', 'eps', 'futurePE'],
      additionalProperties: false,
    },
  },
  {
    name: 'computePBT',
    description: 'Compute Payback Time price. Sums FCF per share growing at FGR over target years. Returns pbtPrice (the price you could pay and get paid back in targetYears).',
    input_schema: {
      type: 'object',
      properties: {
        fcfPerShare: { type: 'number', description: 'Free Cash Flow per share' },
        fgr: { type: 'number', description: 'Future Growth Rate as decimal' },
        targetYears: { type: 'number', description: 'Target payback years (default 8)' },
      },
      required: ['fcfPerShare', 'fgr'],
      additionalProperties: false,
    },
  },
  {
    name: 'computeTenCap',
    description: 'Compute Ten Cap (Owner Earnings) price. Owner Earnings = Operating Cash Flow - Maintenance CapEx + Tax Provision. Ten Cap Price = 10x Owner Earnings per share.',
    input_schema: {
      type: 'object',
      properties: {
        operatingCashFlow: { type: 'number', description: 'Cash from operations (annual)' },
        maintenanceCapEx: { type: 'number', description: 'Maintenance capital expenditures (often 70% of total capex)' },
        taxProvision: { type: 'number', description: 'Income tax provision' },
        sharesOutstanding: { type: 'number', description: 'Diluted shares outstanding' },
        method: { type: 'string', description: 'Calculation method: "ruleOne" or "graham" (default "ruleOne")' },
      },
      required: ['operatingCashFlow', 'sharesOutstanding'],
      additionalProperties: false,
    },
  },
  {
    name: 'computeEquityBond',
    description: 'Compute Equity Bond buy price (Buffettology method). Grows BVPS at equity growth rate (ROE x retained ratio) for 10 years, applies historical P/E, discounts at MARR, then applies MOS%. Returns stickerPrice and buyPrice.',
    input_schema: {
      type: 'object',
      properties: {
        bvps: { type: 'number', description: 'Current Book Value Per Share' },
        roe: { type: 'number', description: 'Return on Equity as decimal (e.g., 0.30 for 30%)' },
        retainedRatio: { type: 'number', description: 'Retained earnings ratio (1 - payout ratio)' },
        historicalPE: { type: 'number', description: 'Historically reasonable average P/E ratio' },
        marr: { type: 'number', description: 'Minimum Acceptable Rate of Return (default 0.20)' },
        mosPercent: { type: 'number', description: 'Margin of Safety percentage (default 0.50)' },
        currentPrice: { type: 'number', description: 'Current stock price for projected return calculation' },
      },
      required: ['bvps', 'roe', 'retainedRatio', 'historicalPE'],
      additionalProperties: false,
    },
  },
  {
    name: 'sensitivityTable',
    description: 'Generate a valuation sensitivity table by varying two parameters. Returns a 2D array of buy prices. Use to test assumptions across a range.',
    input_schema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'Valuation method: "mos", "pbt", "tenCap", "equityBond"' },
        baseInputs: { type: 'object', description: 'Base input values for the valuation method' },
        param1: {
          type: 'object',
          description: 'First parameter to vary: { key: string, values: number[] }',
          properties: {
            key: { type: 'string' },
            values: { type: 'array', items: { type: 'number' } },
          },
          required: ['key', 'values'],
        },
        param2: {
          type: 'object',
          description: 'Second parameter to vary: { key: string, values: number[] }',
          properties: {
            key: { type: 'string' },
            values: { type: 'array', items: { type: 'number' } },
          },
          required: ['key', 'values'],
        },
      },
      required: ['method', 'baseInputs', 'param1', 'param2'],
      additionalProperties: false,
    },
  },

  // ── FCF Helper Tools ─────────────────────────────────────────
  {
    name: 'fcfPerShare',
    description: 'Compute Free Cash Flow per share from FCF ratio and EPS. FCF ratio = FCF / Net Income.',
    input_schema: {
      type: 'object',
      properties: {
        fcfRatio: { type: 'number', description: 'FCF ratio (FCF / Net Income)' },
        eps: { type: 'number', description: 'Earnings Per Share' },
      },
      required: ['fcfRatio', 'eps'],
      additionalProperties: false,
    },
  },
  {
    name: 'yearsToPayback',
    description: 'Compute years to payback at a given price. FCF per share grows at FGR until cumulative FCF reaches the purchase price.',
    input_schema: {
      type: 'object',
      properties: {
        fcfPerShare: { type: 'number', description: 'FCF per share' },
        fgr: { type: 'number', description: 'Future Growth Rate as decimal' },
        price: { type: 'number', description: 'Purchase price per share' },
      },
      required: ['fcfPerShare', 'fgr', 'price'],
      additionalProperties: false,
    },
  },

  // ── Data Lookup Tools (require DataPacket context) ───────────
  {
    name: 'getMetric',
    description: 'Retrieve a specific metric from the DataPacket using dot-notation path. Example: "growthRates.earnings.5yr" returns the 5-year earnings CAGR.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Dot-notation path to the metric (e.g., "growthRates.earnings.5yr", "ruleOneScore.moat")' },
      },
      required: ['metric'],
      additionalProperties: false,
    },
  },
  {
    name: 'getFinancialLine',
    description: 'Retrieve a specific line item from financial statements across years. Returns yearly values for the requested field.',
    input_schema: {
      type: 'object',
      properties: {
        statement: { type: 'string', description: 'Financial statement: "income", "balance", or "cashFlow"' },
        field: { type: 'string', description: 'Field name (e.g., "revenues", "net_income_loss", "total_debt")' },
        years: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional array of years to filter (default: all available years)',
        },
      },
      required: ['statement', 'field'],
      additionalProperties: false,
    },
  },
  {
    name: 'computeGrowthRates',
    description: 'Compute CAGR growth rates for a numeric series across standard periods (10yr, 7yr, 5yr, 3yr, 1yr). Can exclude specific years (e.g., COVID year 2020).',
    input_schema: {
      type: 'object',
      properties: {
        series: {
          type: 'object',
          description: 'Object mapping year to value (e.g., { "2024": 100, "2023": 90, ... })',
        },
        excludeYears: {
          type: 'array',
          items: { type: 'number' },
          description: 'Years to exclude from CAGR calculation (e.g., [2020])',
        },
      },
      required: ['series'],
      additionalProperties: false,
    },
  },
  {
    name: 'comparePeers',
    description: 'Compare a metric across peer companies. Returns the ticker\'s value, peer values, percentile rank, and industry average.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Metric to compare (e.g., "grossMargin", "roe", "revenueGrowth")' },
        topN: { type: 'number', description: 'Number of top peers to return (default 10)' },
      },
      required: ['metric'],
      additionalProperties: false,
    },
  },
  {
    name: 'readFilingSection',
    description: 'Read a specific section from a 10-K or 10-Q filing. Returns the markdown text of the requested section.',
    input_schema: {
      type: 'object',
      properties: {
        form: { type: 'string', description: 'Filing form type: "10-K", "10-Q", "8-K", "DEF 14A"' },
        section: { type: 'string', description: 'Section to extract (e.g., "Business", "Risk Factors", "MD&A")' },
        year: { type: 'number', description: 'Filing year (optional — defaults to most recent)' },
      },
      required: ['form', 'section'],
      additionalProperties: false,
    },
  },
  {
    name: 'getTranscriptExcerpt',
    description: 'Get an earnings call transcript excerpt by topic or quarter. Returns relevant passages from the transcript.',
    input_schema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', description: 'Quarter identifier (e.g., "Q4 2024", "Q1 2025")' },
        topic: { type: 'string', description: 'Topic to search for in the transcript (e.g., "growth", "capex", "guidance")' },
      },
      required: ['quarter'],
      additionalProperties: false,
    },
  },
];

// ─── Standalone Tool Executor ───────────────────────────────────

/**
 * Execute a tool by name with the given input.
 * Works for standalone tools that don't need DataPacket context.
 * For data-dependent tools, use createToolExecutor() instead.
 *
 * @param {string} toolName
 * @param {object} input
 * @returns {*} Tool result
 * @throws {Error} If tool is unknown
 */
export function executeTool(toolName, input) {
  switch (toolName) {
    case 'computeMOS':
      return computeMOS(input);
    case 'computePBT':
      return computePBT(input);
    case 'computeTenCap':
      return computeTenCap(input);
    case 'computeEquityBond':
      return computeEquityBond(input);
    case 'sensitivityTable':
      return sensitivityTable(input);
    case 'fcfPerShare':
      return fcfPerShare(input);
    case 'yearsToPayback':
      return yearsToPayback(input);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── DataPacket-Aware Tool Executor ─────────────────────────────

/**
 * Create a tool executor with DataPacket context.
 * The returned executor handles all tools: standalone AND data-dependent.
 *
 * @param {object} dataPacket — Full or sliced DataPacket
 * @returns {function(string, object): *} Executor function
 */
export function createToolExecutor(dataPacket) {
  return function executor(toolName, input) {
    // Data-dependent tools
    switch (toolName) {
      case 'getMetric':
        return getMetricFromPacket(dataPacket, input);
      case 'getFinancialLine':
        return getFinancialLineFromPacket(dataPacket, input);
      case 'computeGrowthRates':
        return computeGrowthRatesFromInput(input);
      case 'comparePeers':
        return comparePeersFromPacket(dataPacket, input);
      case 'readFilingSection':
        return readFilingSectionStub(input);
      case 'getTranscriptExcerpt':
        return getTranscriptExcerptStub(input);
      default:
        // Fall through to standalone tools
        return executeTool(toolName, input);
    }
  };
}

// ─── Data-Dependent Tool Implementations ────────────────────────

/**
 * Retrieve a metric from DataPacket using dot-notation path.
 * Example: getMetricFromPacket(dp, { metric: 'growthRates.earnings.5yr' })
 */
function getMetricFromPacket(dataPacket, { metric }) {
  if (!metric || !dataPacket) return undefined;

  const parts = metric.split('.');
  let current = dataPacket;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Retrieve a financial line item across years.
 * Example: getFinancialLineFromPacket(dp, { statement: 'income', field: 'revenues', years: [2024, 2023] })
 */
function getFinancialLineFromPacket(dataPacket, { statement, field, years }) {
  const financials = dataPacket?.financials;
  if (!financials || !statement || !field) return null;

  const statementData = financials[statement];
  if (!statementData) return null;

  const targetYears = years || financials.years || Object.keys(statementData).map(Number);
  const result = {};

  for (const year of targetYears) {
    const yearData = statementData[year];
    if (yearData && field in yearData) {
      result[year] = yearData[field];
    }
  }

  return result;
}

/**
 * Compute growth rates from a numeric series.
 * Wraps the growthRates engine function.
 */
function computeGrowthRatesFromInput({ series, excludeYears }) {
  if (!series) return null;

  // Convert series to sorted array format expected by computeGrowthRates
  const sortedEntries = Object.entries(series)
    .map(([year, value]) => ({ year: Number(year), value }))
    .sort((a, b) => a.year - b.year);

  const excludeSet = new Set(excludeYears || []);
  return computeGrowthRates(sortedEntries, excludeSet);
}

/**
 * Compare a metric across peers from the DataPacket.
 * Returns ticker value, peer values, percentile, and average.
 */
function comparePeersFromPacket(dataPacket, { metric, topN = 10 }) {
  const peerMetrics = dataPacket?.peerMetrics;
  if (!peerMetrics || !metric) return null;

  // Extract metric values for all peers
  const values = [];
  for (const [cik, peerData] of Object.entries(peerMetrics)) {
    const value = peerData?.[metric];
    if (value != null) {
      values.push({ cik, ticker: peerData.ticker || cik, name: peerData.name || '', value });
    }
  }

  if (values.length === 0) return { metric, peers: [], average: null, count: 0 };

  values.sort((a, b) => b.value - a.value);
  const top = values.slice(0, topN);
  const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length;

  return {
    metric,
    peers: top,
    average: avg,
    count: values.length,
  };
}

/**
 * Read a filing section. Stub — requires async filing fetch.
 * In production, this will call fetchFilingMarkdown + section extraction.
 * Returns a placeholder indicating the tool needs async execution context.
 */
function readFilingSectionStub({ form, section, year }) {
  return {
    available: false,
    message: `Filing section reader requires async context. Requested: ${form} ${section}${year ? ` (${year})` : ''}`,
    form,
    section,
    year: year || null,
  };
}

/**
 * Get transcript excerpt. Stub — requires async transcript fetch.
 * In production, this will call fetchTranscript + topic search.
 * Returns a placeholder indicating the tool needs async execution context.
 */
function getTranscriptExcerptStub({ quarter, topic }) {
  return {
    available: false,
    message: `Transcript excerpt requires async context. Requested: ${quarter}${topic ? ` topic="${topic}"` : ''}`,
    quarter,
    topic: topic || null,
  };
}
