// aiResearch.js — Unit tests for the AI agent dispatch engine
// Tests-first: these tests define the expected behavior of all aiResearch.js
// public functions. They will FAIL until Plan 02 creates the engine.
// Covers: API-01 (structured outputs), API-04 (web search URL extraction),
//         API-05 (error handling + retry), FIX-02 (citation URL enrichment)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mockResponses from './fixtures/mock-api-response.json';

// These imports will fail until Plan 02 creates aiResearch.js — expected.
import { dispatchAgent, _testExports } from '../aiResearch.js';
const {
  extractWebSearchURLs,
  enrichCitationsWithURLs,
  buildUsage,
  sliceDataPacket,
} = _testExports;

// ─── Mock Anthropic SDK ──────────────────────────────────────────────
vi.mock('@anthropic-ai/sdk', () => {
  const mockParse = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { parse: mockParse },
    })),
    __mockParse: mockParse,
  };
});

// ─── Mock fs (for agent config + prompt loading) ─────────────────────
vi.mock('fs', () => ({
  readFileSync: vi.fn((filePath) => {
    if (filePath.includes('config.json')) {
      return JSON.stringify({
        role: 'business-analyst',
        model: 'sonnet',
        curriculum: [],
        dataPacketSlice: ['companyInfo'],
        universalContext: false,
      });
    }
    if (filePath.includes('prompt.md')) {
      return 'You are a business analyst.';
    }
    return '';
  }),
}));

// ─── extractWebSearchURLs ────────────────────────────────────────────
describe('extractWebSearchURLs', () => {
  it('should extract all URLs from web_search_tool_result blocks', () => {
    const urls = extractWebSearchURLs(mockResponses.successResponse);
    expect(urls).toHaveLength(5);
    expect(urls[0]).toHaveProperty('url');
    expect(urls[0]).toHaveProperty('title');
    expect(urls[0]).toHaveProperty('pageAge');
    const urlStrings = urls.map((u) => u.url);
    expect(urlStrings).toContain('https://www.reuters.com/markets/companies/SFM/');
    expect(urlStrings).toContain('https://finance.yahoo.com/quote/SFM/');
    expect(urlStrings).toContain(
      'https://www.macrotrends.net/stocks/charts/SFM/sprouts-farmers-market/revenue',
    );
    expect(urlStrings).toContain('https://seekingalpha.com/article/sfm-analysis');
    expect(urlStrings).toContain(
      'https://www.fool.com/investing/sfm-competitive-position',
    );
  });

  it('should return empty array for response with no content blocks', () => {
    const urls = extractWebSearchURLs(mockResponses.refusalResponse);
    expect(urls).toEqual([]);
  });

  it('should return empty array when content has no web_search_tool_result blocks', () => {
    const textOnlyResponse = {
      content: [
        { type: 'text', text: 'Some analysis text' },
        { type: 'text', text: 'More text' },
      ],
    };
    const urls = extractWebSearchURLs(textOnlyResponse);
    expect(urls).toEqual([]);
  });
});

// ─── enrichCitationsWithURLs ────────────────────────────────────────
describe('enrichCitationsWithURLs', () => {
  const webSearchURLs = [
    {
      url: 'https://seekingalpha.com/article/sfm-analysis',
      title: 'SFM: A Specialty Grocery Moat',
      pageAge: '14d',
    },
    {
      url: 'https://www.fool.com/investing/sfm-competitive-position',
      title: 'Is Sprouts a Buy?',
      pageAge: '30d',
    },
    {
      url: 'https://www.reuters.com/markets/companies/SFM/',
      title: 'SFM Company Profile',
      pageAge: '2d',
    },
  ];

  it('should enrich citation without url by domain match', () => {
    const section = {
      citations: [
        { id: 4, ref: 'web-search-2', text: 'Market growing 8% CAGR', source: 'Seeking Alpha' },
      ],
    };
    enrichCitationsWithURLs(section, webSearchURLs);
    expect(section.citations[0].url).toBe('https://seekingalpha.com/article/sfm-analysis');
  });

  it('should skip citation that already has url', () => {
    const section = {
      citations: [
        {
          id: 3,
          ref: 'web-search-1',
          text: 'Q4 revenue',
          source: 'Reuters',
          url: 'https://existing-url.com/',
        },
      ],
    };
    enrichCitationsWithURLs(section, webSearchURLs);
    expect(section.citations[0].url).toBe('https://existing-url.com/');
  });

  it('should skip DataPacket citations (source === DataPacket)', () => {
    const section = {
      citations: [
        {
          id: 1,
          ref: 'dataPacket.companyInfo.sector',
          text: 'Consumer Defensive',
          source: 'DataPacket',
        },
      ],
    };
    enrichCitationsWithURLs(section, webSearchURLs);
    expect(section.citations[0].url).toBeUndefined();
  });

  it('should skip citations with ref starting with dataPacket.', () => {
    const section = {
      citations: [
        {
          id: 6,
          ref: 'dataPacket.financials.revenue',
          text: '$7.4B revenue',
          source: 'Company Financials',
        },
      ],
    };
    enrichCitationsWithURLs(section, webSearchURLs);
    expect(section.citations[0].url).toBeUndefined();
  });

  it('should handle no matching URL gracefully', () => {
    const section = {
      citations: [
        {
          id: 7,
          ref: 'web-search-99',
          text: 'Some claim',
          source: 'Unknown Source',
        },
      ],
    };
    enrichCitationsWithURLs(section, webSearchURLs);
    expect(section.citations[0].url).toBeUndefined();
  });
});

// ─── buildUsage ─────────────────────────────────────────────────────
describe('buildUsage', () => {
  it('should compute correct cost for Sonnet model', () => {
    const usage = buildUsage(mockResponses.successResponse.usage, 'claude-sonnet-4-6');
    expect(usage.inputTokens).toBe(45230);
    expect(usage.outputTokens).toBe(3842);
    expect(usage.cacheRead).toBe(0);
    expect(usage.cacheWrite).toBe(0);
    expect(usage.webSearches).toBe(2);
    // Cost: 45230 * 3 / 1e6 + 3842 * 15 / 1e6 + 2 * 0.01 = 0.13569 + 0.05763 + 0.02 = 0.21332
    expect(usage.cost).toBeCloseTo(0.2133, 2);
  });

  it('should compute correct cost for Opus model', () => {
    const usage = buildUsage(mockResponses.successResponse.usage, 'claude-opus-4-6');
    expect(usage.inputTokens).toBe(45230);
    expect(usage.outputTokens).toBe(3842);
    // Cost: 45230 * 15 / 1e6 + 3842 * 75 / 1e6 + 2 * 0.01 = 0.67845 + 0.28815 + 0.02 = 0.9866
    expect(usage.cost).toBeCloseTo(0.9866, 2);
  });

  it('should handle missing usage fields gracefully', () => {
    const usage = buildUsage({}, 'claude-sonnet-4-6');
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.cacheRead).toBe(0);
    expect(usage.cacheWrite).toBe(0);
    expect(usage.webSearches).toBe(0);
    expect(usage.cost).toBe(0);
  });
});

// ─── sliceDataPacket ────────────────────────────────────────────────
describe('sliceDataPacket', () => {
  const dataPacket = {
    ticker: 'SFM',
    caveats: ['No quarterly data'],
    companyInfo: { name: 'Sprouts Farmers Market', sector: 'Consumer Defensive' },
    classification: { sic: '5411', industry: 'Grocery' },
    financials: { revenue: 7400000000, netIncome: 470000000 },
  };

  it('should slice by specified keys and always include ticker and caveats', () => {
    const result = sliceDataPacket(dataPacket, ['companyInfo', 'classification']);
    expect(result.ticker).toBe('SFM');
    expect(result.caveats).toEqual(['No quarterly data']);
    expect(result.companyInfo).toEqual({
      name: 'Sprouts Farmers Market',
      sector: 'Consumer Defensive',
    });
    expect(result.classification).toEqual({ sic: '5411', industry: 'Grocery' });
    expect(result.financials).toBeUndefined();
  });

  it('should return only ticker and caveats for empty sliceKeys', () => {
    const result = sliceDataPacket(dataPacket, []);
    expect(result.ticker).toBe('SFM');
    expect(result.caveats).toEqual(['No quarterly data']);
    expect(result.companyInfo).toBeUndefined();
    expect(result.classification).toBeUndefined();
    expect(result.financials).toBeUndefined();
  });

  it('should ignore missing keys without error', () => {
    const result = sliceDataPacket(dataPacket, ['companyInfo', 'nonExistentField']);
    expect(result.ticker).toBe('SFM');
    expect(result.companyInfo).toBeDefined();
    expect(result.nonExistentField).toBeUndefined();
  });
});

// ─── dispatchAgent ──────────────────────────────────────────────────
describe('dispatchAgent', () => {
  let mockParse;

  beforeEach(async () => {
    // Get the mock parse function from the mocked SDK
    const sdk = await import('@anthropic-ai/sdk');
    mockParse = sdk.__mockParse;
    mockParse.mockReset();
    mockParse.mockResolvedValue(mockResponses.successResponse);
  });

  it('should return rich result object with section, usage, webSearches, model, duration', async () => {
    const dataPacket = {
      ticker: 'SFM',
      caveats: [],
      companyInfo: { name: 'Sprouts', sector: 'Consumer Defensive' },
    };
    const result = await dispatchAgent('business-analyst', dataPacket);
    expect(result).toHaveProperty('section');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('webSearches');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('duration');
    expect(result.error).toBeNull();
    expect(result.section.key).toBe('radar');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(typeof result.duration).toBe('number');
  });

  it('should parse section.data from JSON string to object (D-06)', async () => {
    const dataPacket = {
      ticker: 'SFM',
      caveats: [],
      companyInfo: { name: 'Sprouts', sector: 'Consumer Defensive' },
    };
    const result = await dispatchAgent('business-analyst', dataPacket);
    // D-06: section.data arrives as JSON string from API, engine should parse it
    expect(typeof result.section.data).toBe('object');
    expect(result.section.data.ticker).toBe('SFM');
    expect(result.section.data.sector).toBe('Consumer Defensive');
  });

  it('should include extracted web search URLs in webSearches array', async () => {
    const dataPacket = {
      ticker: 'SFM',
      caveats: [],
      companyInfo: { name: 'Sprouts', sector: 'Consumer Defensive' },
    };
    const result = await dispatchAgent('business-analyst', dataPacket);
    expect(result.webSearches).toHaveLength(5);
    const urls = result.webSearches.map((ws) => ws.url);
    expect(urls).toContain('https://www.reuters.com/markets/companies/SFM/');
  });
});

// ─── dispatchWithRetry ──────────────────────────────────────────────
describe('dispatchWithRetry', () => {
  it('should retry once on max_tokens stop_reason', async () => {
    const callFn = vi.fn();
    callFn
      .mockResolvedValueOnce(mockResponses.maxTokensResponse)
      .mockResolvedValueOnce(mockResponses.successResponse);

    const { dispatchWithRetry } = _testExports;
    const result = await dispatchWithRetry(callFn, 'test-agent');
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
    expect(result.result).toBeDefined();
  });

  it('should return null with error on refusal', async () => {
    const callFn = vi.fn().mockResolvedValue(mockResponses.refusalResponse);

    const { dispatchWithRetry } = _testExports;
    const result = await dispatchWithRetry(callFn, 'test-agent');
    expect(result.result).toBeNull();
    expect(result.error).toContain('refused');
  });

  it('should wait and retry on 429 rate limit error', async () => {
    const callFn = vi.fn();
    const rateLimitError = new Error('rate limited');
    rateLimitError.status = 429;
    rateLimitError.headers = { 'retry-after': '1' };
    callFn
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(mockResponses.successResponse);

    const { dispatchWithRetry } = _testExports;
    const result = await dispatchWithRetry(callFn, 'test-agent');
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
  });

  it('should NOT retry on 400 error and return error immediately', async () => {
    const callFn = vi.fn();
    const schemaError = new Error('schema error');
    schemaError.status = 400;
    callFn.mockRejectedValueOnce(schemaError);

    const { dispatchWithRetry } = _testExports;
    const result = await dispatchWithRetry(callFn, 'test-agent');
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(result.result).toBeNull();
    expect(result.error).toContain('400');
  });
});
