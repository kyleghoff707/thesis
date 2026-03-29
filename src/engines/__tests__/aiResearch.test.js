import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import mockResponses from './fixtures/mock-api-response.json';

// Hoist the mock function so vi.mock factory can reference it
const { __mockParse } = vi.hoisted(() => {
  const __mockParse = vi.fn();
  return { __mockParse };
});

// Mock the Anthropic SDK before importing aiResearch
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor() {
        this.messages = { parse: __mockParse };
      }
    },
  };
});

// Mock fs.readFileSync for agent config/prompt loading
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync: vi.fn((path, encoding) => {
      if (path.includes('config.json')) {
        return JSON.stringify({
          role: 'business-analyst',
          model: 'sonnet',
          curriculum: [],
          dataPacketSlice: ['companyInfo'],
          universalContext: false,
        });
      }
      if (path.includes('prompt.md')) {
        return 'You are a business analyst.';
      }
      // Fall through to actual for other files (like fixtures loaded by JSON import)
      return actual.readFileSync(path, encoding);
    }),
  };
});

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock zodOutputFormat helper
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: vi.fn(() => ({ type: 'json_schema', json_schema: {} })),
}));

// Mock reportSection schema
vi.mock('../../schemas/reportSection.js', () => ({
  ReportSectionSchema: {},
}));

import { dispatchAgent, _testExports } from '../aiResearch.js';

const {
  extractWebSearchURLs,
  enrichCitationsWithURLs,
  buildUsage,
  sliceDataPacket,
  loadAgentConfig,
  loadAgentPrompt,
  loadCurriculum,
  buildUserMessage,
  MODEL_MAP,
  PRICING,
} = _testExports;

// ─── extractWebSearchURLs ───────────────────────────────────────

describe('extractWebSearchURLs', () => {
  it('extracts all URLs from web_search_tool_result blocks', () => {
    const urls = extractWebSearchURLs(mockResponses.successResponse);
    expect(urls).toHaveLength(5);
    expect(urls[0]).toHaveProperty('url');
    expect(urls[0]).toHaveProperty('title');
    expect(urls[0]).toHaveProperty('pageAge');
    const allUrls = urls.map(u => u.url);
    expect(allUrls).toContain('https://www.reuters.com/markets/companies/SFM/');
    expect(allUrls).toContain('https://finance.yahoo.com/quote/SFM/');
    expect(allUrls).toContain('https://www.macrotrends.net/stocks/charts/SFM/sprouts-farmers-market/revenue');
    expect(allUrls).toContain('https://seekingalpha.com/article/sfm-analysis');
    expect(allUrls).toContain('https://www.fool.com/investing/sfm-competitive-position');
  });

  it('returns empty array for response with no content blocks', () => {
    const urls = extractWebSearchURLs(mockResponses.refusalResponse);
    expect(urls).toEqual([]);
  });

  it('returns empty array when content blocks have no web_search_tool_result', () => {
    const response = {
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ],
    };
    const urls = extractWebSearchURLs(response);
    expect(urls).toEqual([]);
  });
});

// ─── enrichCitationsWithURLs ────────────────────────────────────

describe('enrichCitationsWithURLs', () => {
  const webURLs = [
    { url: 'https://seekingalpha.com/article/sfm-analysis', title: 'SFM: A Specialty Grocery Moat', pageAge: '14d' },
    { url: 'https://www.fool.com/investing/sfm-competitive-position', title: 'Is Sprouts a Buy?', pageAge: '30d' },
    { url: 'https://www.reuters.com/markets/companies/SFM/', title: 'Sprouts Farmers Market Inc (SFM) Company Profile', pageAge: '2d' },
  ];

  it('enriches citation without url by domain match', () => {
    const section = {
      citations: [
        { id: 4, ref: 'web-search-2', text: 'Specialty grocery market growing 8% CAGR', source: 'Seeking Alpha' },
      ],
    };
    enrichCitationsWithURLs(section, webURLs);
    expect(section.citations[0].url).toBe('https://seekingalpha.com/article/sfm-analysis');
  });

  it('skips citation that already has url', () => {
    const existingUrl = 'https://example.com/existing';
    const section = {
      citations: [
        { id: 3, ref: 'web-search-1', text: 'SFM reported Q4 revenue', source: 'Reuters', url: existingUrl },
      ],
    };
    enrichCitationsWithURLs(section, webURLs);
    expect(section.citations[0].url).toBe(existingUrl);
  });

  it('skips DataPacket citations', () => {
    const section = {
      citations: [
        { id: 1, ref: 'dataPacket.companyInfo.sector', text: 'Consumer Defensive', source: 'DataPacket' },
      ],
    };
    enrichCitationsWithURLs(section, webURLs);
    expect(section.citations[0].url).toBeUndefined();
  });

  it('skips citations with ref starting with dataPacket.', () => {
    const section = {
      citations: [
        { id: 6, ref: 'dataPacket.financials', text: 'Revenue data', source: 'Internal Data' },
      ],
    };
    enrichCitationsWithURLs(section, webURLs);
    expect(section.citations[0].url).toBeUndefined();
  });

  it('handles no matching URL gracefully', () => {
    const section = {
      citations: [
        { id: 7, ref: 'web-search-99', text: 'Some data', source: 'Unknown Source' },
      ],
    };
    enrichCitationsWithURLs(section, webURLs);
    expect(section.citations[0].url).toBeUndefined();
  });
});

// ─── buildUsage ─────────────────────────────────────────────────

describe('buildUsage', () => {
  it('computes correct cost for Sonnet', () => {
    const usage = buildUsage(mockResponses.successResponse.usage, 'claude-sonnet-4-6');
    expect(usage.inputTokens).toBe(45230);
    expect(usage.outputTokens).toBe(3842);
    expect(usage.cacheRead).toBe(0);
    expect(usage.cacheWrite).toBe(0);
    expect(usage.webSearches).toBe(2);
    // cost = 45230*3/1e6 + 3842*15/1e6 + 2*0.01 = 0.13569 + 0.05763 + 0.02 = 0.21332
    expect(usage.cost).toBeCloseTo(0.2133, 2);
  });

  it('computes correct cost for Opus', () => {
    const usage = buildUsage(mockResponses.successResponse.usage, 'claude-opus-4-6');
    expect(usage.inputTokens).toBe(45230);
    expect(usage.outputTokens).toBe(3842);
    // cost = 45230*5/1e6 + 3842*25/1e6 + 2*0.01 = 0.22615 + 0.09605 + 0.02 = 0.3422
    expect(usage.cost).toBeCloseTo(0.3422, 2);
  });

  it('handles missing usage fields gracefully', () => {
    const usage = buildUsage({}, 'claude-sonnet-4-6');
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.cacheRead).toBe(0);
    expect(usage.cacheWrite).toBe(0);
    expect(usage.webSearches).toBe(0);
    expect(usage.cost).toBe(0);
  });
});

// ─── sliceDataPacket ────────────────────────────────────────────

describe('sliceDataPacket', () => {
  const fullPacket = {
    ticker: 'SFM',
    caveats: ['test caveat'],
    companyInfo: { name: 'Sprouts' },
    classification: { sector: 'Consumer Staples' },
    financials: { revenue: 7400000000 },
  };

  it('slices by specified keys', () => {
    const result = sliceDataPacket(fullPacket, ['companyInfo', 'classification']);
    expect(result.ticker).toBe('SFM');
    expect(result.caveats).toEqual(['test caveat']);
    expect(result.companyInfo).toEqual({ name: 'Sprouts' });
    expect(result.classification).toEqual({ sector: 'Consumer Staples' });
    expect(result.financials).toBeUndefined();
  });

  it('returns only ticker and caveats for empty sliceKeys', () => {
    const result = sliceDataPacket(fullPacket, []);
    expect(result.ticker).toBe('SFM');
    expect(result.caveats).toEqual(['test caveat']);
    expect(result.companyInfo).toBeUndefined();
    expect(result.classification).toBeUndefined();
    expect(result.financials).toBeUndefined();
  });

  it('returns only ticker and caveats for null sliceKeys', () => {
    const result = sliceDataPacket(fullPacket, null);
    expect(result.ticker).toBe('SFM');
    expect(result.caveats).toEqual(['test caveat']);
    expect(result.companyInfo).toBeUndefined();
  });

  it('ignores missing keys', () => {
    const result = sliceDataPacket(fullPacket, ['companyInfo', 'nonExistentField']);
    expect(result.companyInfo).toEqual({ name: 'Sprouts' });
    expect(result.nonExistentField).toBeUndefined();
  });
});

// ─── buildUserMessage ───────────────────────────────────────────

describe('buildUserMessage', () => {
  it('includes DataPacket in JSON code fence', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {});
    expect(msg).toContain('## DataPacket');
    expect(msg).toContain('```json');
    expect(msg).toContain('"ticker": "SFM"');
  });

  it('includes section assignment when provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, { sectionAssignment: 'Generate section 1' });
    expect(msg).toContain('## Assignment');
    expect(msg).toContain('Generate section 1');
  });

  it('includes prior sections when provided', () => {
    const priorSections = [
      { title: 'Radar', status: 'pass', summary: 'Looks good', redFlags: ['Risk 1'] },
    ];
    const msg = buildUserMessage({ ticker: 'SFM' }, { priorSections });
    expect(msg).toContain('## Prior Section Findings');
    expect(msg).toContain('Radar');
    expect(msg).toContain('Risk 1');
  });

  it('omits assignment and prior sections when not provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {});
    expect(msg).not.toContain('## Assignment');
    expect(msg).not.toContain('## Prior Section Findings');
  });
});

// ─── dispatchAgent ──────────────────────────────────────────────

describe('dispatchAgent', () => {
  beforeEach(() => {
    __mockParse.mockReset();
    __mockParse.mockResolvedValue(mockResponses.successResponse);
  });

  it('returns rich result object with section, usage, webSearches, model, duration, error:null', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result).toHaveProperty('section');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('webSearches');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('stopReason');
    expect(result).toHaveProperty('duration');
    expect(result.error).toBeNull();
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.stopReason).toBe('end_turn');
    expect(typeof result.duration).toBe('number');
  });

  it('parses section.data from JSON string to object (D-06)', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(typeof result.section.data).toBe('object');
    expect(result.section.data.ticker).toBe('SFM');
    expect(result.section.data.simpleScore).toBe(8);
  });

  it('webSearches array contains extracted URLs from response', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result.webSearches).toHaveLength(5);
    const urls = result.webSearches.map(ws => ws.url);
    expect(urls).toContain('https://seekingalpha.com/article/sfm-analysis');
  });

  it('enriches citation URLs from web search results', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    // Citation 4 (source "Seeking Alpha") should get the seekingalpha URL
    const citation4 = result.section.citations.find(c => c.id === 4);
    expect(citation4.url).toBe('https://seekingalpha.com/article/sfm-analysis');

    // Citation 1 (source "DataPacket") should NOT get a URL
    const citation1 = result.section.citations.find(c => c.id === 1);
    expect(citation1.url).toBeUndefined();
  });

  it('overwrites tokenCost and modelUsed from actual API response', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result.section.tokenCost.input).toBe(45230);
    expect(result.section.tokenCost.output).toBe(3842);
    expect(result.section.modelUsed).toBe('claude-sonnet-4-6');
  });
});

// ─── dispatchWithRetry ──────────────────────────────────────────

describe('dispatchWithRetry', () => {
  beforeEach(() => {
    __mockParse.mockReset();
  });

  it('retries on max_tokens and succeeds on second attempt', async () => {
    // First call returns max_tokens, second returns end_turn
    __mockParse
      .mockResolvedValueOnce(mockResponses.maxTokensResponse)
      .mockResolvedValueOnce(mockResponses.successResponse);

    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result.error).toBeNull();
    expect(result.section).not.toBeNull();
    expect(__mockParse).toHaveBeenCalledTimes(2);
  });

  it('returns error on refusal', async () => {
    __mockParse.mockResolvedValue(mockResponses.refusalResponse);

    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result.section).toBeNull();
    expect(result.error).toContain('refused');
  });

  it('retries on 429 rate limit', async () => {
    const rateLimitError = new Error('rate limited');
    rateLimitError.status = 429;
    rateLimitError.headers = { 'retry-after': '1' };

    __mockParse
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(mockResponses.successResponse);

    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result.error).toBeNull();
    expect(result.section).not.toBeNull();
  });

  it('does NOT retry on 400 error', async () => {
    const badRequestError = new Error('schema error');
    badRequestError.status = 400;

    __mockParse.mockRejectedValue(badRequestError);

    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket);

    expect(result.section).toBeNull();
    expect(result.error).toContain('400');
    expect(__mockParse).toHaveBeenCalledTimes(1);
  });
});

// ─── MODEL_MAP and PRICING ─────────────────────────────────────

describe('constants', () => {
  it('MODEL_MAP maps sonnet and opus to correct model IDs', () => {
    expect(MODEL_MAP.sonnet).toBe('claude-sonnet-4-6');
    expect(MODEL_MAP.opus).toBe('claude-opus-4-6');
  });

  it('PRICING contains entries for both models', () => {
    expect(PRICING['claude-sonnet-4-6']).toBeDefined();
    expect(PRICING['claude-opus-4-6']).toBeDefined();
    expect(PRICING['claude-sonnet-4-6'].input).toBe(3.0);
    expect(PRICING['claude-sonnet-4-6'].output).toBe(15.0);
    expect(PRICING['claude-opus-4-6'].input).toBe(5.0);
    expect(PRICING['claude-opus-4-6'].output).toBe(25.0);
  });
});
