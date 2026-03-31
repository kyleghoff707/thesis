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
  buildSystemBlocks,
  generateFieldPathBlock,
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

// ─── generateFieldPathBlock ─────────────────────────────────────

describe('generateFieldPathBlock', () => {
  it('produces string containing top-level key paths for simple object', () => {
    const result = generateFieldPathBlock({ ticker: 'SFM', companyInfo: { name: 'Sprouts', sector: 'Consumer' } });
    expect(result).toContain('dataPacket.ticker');
    expect(result).toContain('dataPacket.companyInfo');
    expect(result).toContain('.name');
    expect(result).toContain('.sector');
  });

  it('shows null for null field values', () => {
    const result = generateFieldPathBlock({ ticker: 'SFM', emptyField: null });
    expect(result).toContain('dataPacket.emptyField');
    expect(result).toContain('null');
  });

  it('shows array[N] for array field values with correct length', () => {
    const result = generateFieldPathBlock({ ticker: 'SFM', items: [1, 2, 3] });
    expect(result).toContain('dataPacket.items');
    expect(result).toContain('array[3]');
  });

  it('shows {N fields} count and second-level keys for nested objects', () => {
    const result = generateFieldPathBlock({
      ticker: 'SFM',
      financials: { revenue: 7400000000, netIncome: 500000000, grossMargin: 0.38 },
    });
    expect(result).toContain('dataPacket.financials');
    expect(result).toContain('{3 fields}');
    expect(result).toContain('.revenue');
    expect(result).toContain('.netIncome');
    expect(result).toContain('.grossMargin');
  });

  it('truncates second-level keys at 20 and shows "...and N more fields"', () => {
    const bigObject = {};
    for (let i = 0; i < 25; i++) {
      bigObject[`field${i}`] = i;
    }
    const result = generateFieldPathBlock({ ticker: 'SFM', data: bigObject });
    expect(result).toContain('{25 fields}');
    expect(result).toContain('.field0');
    expect(result).toContain('.field19');
    expect(result).toContain('...and 5 more fields');
    expect(result).not.toContain('.field20');
  });

  it('shows {0 fields} for empty object', () => {
    const result = generateFieldPathBlock({ ticker: 'SFM', empty: {} });
    expect(result).toContain('dataPacket.empty');
    expect(result).toContain('{0 fields}');
  });

  it('starts with ## DataPacket Field Paths header', () => {
    const result = generateFieldPathBlock({ ticker: 'SFM' });
    expect(result.startsWith('## DataPacket Field Paths')).toBe(true);
  });

  it('contains ONLY valid ref paths instruction text', () => {
    const result = generateFieldPathBlock({ ticker: 'SFM' });
    expect(result).toContain('ONLY valid');
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

  it('includes PM Feedback section when pmFeedback is provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, { pmFeedback: 'Dig deeper into competitive moat' });
    expect(msg).toContain('## PM Feedback');
    expect(msg).toContain('Dig deeper into competitive moat');
  });

  it('omits PM Feedback section when pmFeedback is not provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {});
    expect(msg).not.toContain('## PM Feedback');
  });

  it('includes DataPacket Field Paths BEFORE DataPacket JSON section', () => {
    const msg = buildUserMessage({ ticker: 'SFM', companyInfo: { name: 'Sprouts' } }, {});
    const fieldPathsIdx = msg.indexOf('## DataPacket Field Paths');
    const dataPacketIdx = msg.indexOf('## DataPacket\n');
    expect(fieldPathsIdx).toBeGreaterThanOrEqual(0);
    expect(dataPacketIdx).toBeGreaterThanOrEqual(0);
    expect(fieldPathsIdx).toBeLessThan(dataPacketIdx);
  });

  it('field path block contains ONLY valid ref paths instruction text', () => {
    const msg = buildUserMessage({ ticker: 'SFM', companyInfo: { name: 'Sprouts' } }, {});
    expect(msg).toContain('ONLY valid');
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

  it('passes system blocks array (not single-string block) to client.messages.parse', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket);

    const callArgs = __mockParse.mock.calls[0][0];
    expect(Array.isArray(callArgs.system)).toBe(true);
    // Should have at least 1 block (agent-specific); no single-string pattern
    expect(callArgs.system.length).toBeGreaterThanOrEqual(1);
    // Each block should be an object with type: 'text'
    for (const block of callArgs.system) {
      expect(block.type).toBe('text');
      expect(typeof block.text).toBe('string');
    }
  });

  it('includes psrFindings as cache_control block when provided', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket, { psrFindings: 'PSR analysis results here' });

    const callArgs = __mockParse.mock.calls[0][0];
    const psrBlock = callArgs.system.find(b => b.text === 'PSR analysis results here');
    expect(psrBlock).toBeDefined();
    expect(psrBlock.cache_control).toEqual({ type: 'ephemeral' });
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

// ─── buildSystemBlocks ─────────────────────────────────────────

describe('buildSystemBlocks', () => {
  it('returns array with cached universal context and uncached agent-specific block', () => {
    const blocks = buildSystemBlocks('Universal context here', null, 'Agent prompt', null);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].text).toBe('Universal context here');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1].type).toBe('text');
    expect(blocks[1].text).toBe('Agent prompt');
    expect(blocks[1]).not.toHaveProperty('cache_control');
  });

  it('returns 3 blocks with universal, PSR findings, and agent-specific when all provided', () => {
    const blocks = buildSystemBlocks('Universal', 'PSR findings data', 'Prompt', 'Curriculum');
    expect(blocks).toHaveLength(3);
    // Block 1: universal context — cached
    expect(blocks[0].text).toBe('Universal');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    // Block 2: PSR findings — cached
    expect(blocks[1].text).toBe('PSR findings data');
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' });
    // Block 3: agent-specific — NOT cached
    expect(blocks[2].text).toContain('Prompt');
    expect(blocks[2].text).toContain('Curriculum');
    expect(blocks[2]).not.toHaveProperty('cache_control');
  });

  it('omits universal context block when not provided', () => {
    const blocks = buildSystemBlocks('', null, 'Agent prompt', 'Curriculum');
    // Should only have agent-specific block (no universal, no PSR)
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('Agent prompt');
    expect(blocks[0]).not.toHaveProperty('cache_control');
  });

  it('omits PSR findings block when not provided', () => {
    const blocks = buildSystemBlocks('Universal', null, 'Agent prompt', null);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('Universal');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1].text).toBe('Agent prompt');
    expect(blocks[1]).not.toHaveProperty('cache_control');
  });

  it('joins prompt and curriculum with separator in agent-specific block', () => {
    const blocks = buildSystemBlocks('Universal', null, 'My prompt', 'My curriculum');
    expect(blocks).toHaveLength(2);
    expect(blocks[1].text).toBe('My prompt\n\n---\n\nMy curriculum');
  });

  it('last block never has cache_control property', () => {
    // With all blocks
    const blocks1 = buildSystemBlocks('Univ', 'PSR', 'Prompt', 'Curr');
    expect(blocks1[blocks1.length - 1]).not.toHaveProperty('cache_control');

    // With only agent-specific
    const blocks2 = buildSystemBlocks('', null, 'Prompt', null);
    expect(blocks2[blocks2.length - 1]).not.toHaveProperty('cache_control');

    // With universal + agent-specific
    const blocks3 = buildSystemBlocks('Univ', null, 'Prompt', null);
    expect(blocks3[blocks3.length - 1]).not.toHaveProperty('cache_control');
  });

  it('handles empty strings and null for curriculum', () => {
    const blocks = buildSystemBlocks('Universal', 'PSR', 'Prompt', '');
    expect(blocks).toHaveLength(3);
    // Agent-specific block should be just the prompt (no separator for empty curriculum)
    expect(blocks[2].text).toBe('Prompt');
  });
});

// ─── Schema parameter (D-05) ──────────────────────────────────

describe('schema parameter', () => {
  beforeEach(() => {
    __mockParse.mockReset();
    __mockParse.mockResolvedValue(mockResponses.successResponse);
  });

  it('uses options.schema when provided instead of ReportSectionSchema', async () => {
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
    zodOutputFormat.mockClear();

    const customSchema = { _custom: true };
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket, { schema: customSchema });

    // zodOutputFormat should be called with the custom schema, not ReportSectionSchema
    expect(zodOutputFormat).toHaveBeenCalledWith(customSchema);
  });

  it('defaults to ReportSectionSchema when options.schema is not provided', async () => {
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
    zodOutputFormat.mockClear();

    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket);

    // zodOutputFormat should be called with the mocked ReportSectionSchema (empty object)
    const { ReportSectionSchema: MockRSS } = await import('../../schemas/reportSection.js');
    expect(zodOutputFormat).toHaveBeenCalledWith(MockRSS);
  });

  it('skips data JSON.parse and citation enrichment when custom schema is provided', async () => {
    // Mock response with debate-like parsed_output (no data/citations/tokenCost fields)
    const debateResponse = {
      ...mockResponses.successResponse,
      parsed_output: {
        step: 1,
        role: 'bull',
        agent: 'synthesis-writer',
        content: { thesisPoints: [], overallThesis: 'Bull thesis' },
      },
    };
    __mockParse.mockResolvedValue(debateResponse);

    const customSchema = { _debate: true };
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    const result = await dispatchAgent('business-analyst', dataPacket, { schema: customSchema });

    // Section should be the debate output unchanged (no data parse, no tokenCost overwrite)
    expect(result.section.step).toBe(1);
    expect(result.section.role).toBe('bull');
    expect(result.section.tokenCost).toBeUndefined(); // not overwritten
    expect(result.section.modelUsed).toBeUndefined(); // not overwritten
  });
});

// ─── Web search gating (D-03) ─────────────────────────────────

describe('web search gating', () => {
  beforeEach(() => {
    __mockParse.mockReset();
    __mockParse.mockResolvedValue(mockResponses.successResponse);
  });

  it('sends empty tools array when maxSearches === 0', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket, { maxSearches: 0 });

    const callArgs = __mockParse.mock.calls[0][0];
    expect(callArgs.tools).toEqual([]);
  });

  it('sends web search tool when maxSearches is not 0', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket, { maxSearches: 3 });

    const callArgs = __mockParse.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0].type).toBe('web_search_20250305');
    expect(callArgs.tools[0].max_uses).toBe(3);
  });

  it('sends web search tool with default max_uses when maxSearches is not specified', async () => {
    const dataPacket = { ticker: 'SFM', caveats: [], companyInfo: { name: 'Sprouts' } };
    await dispatchAgent('business-analyst', dataPacket);

    const callArgs = __mockParse.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0].max_uses).toBe(5);
  });
});

// ─── Debate context in user message ───────────────────────────

describe('debate context in buildUserMessage', () => {
  it('includes debate context section when debateContext is provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {
      debateContext: 'Step 1 bull thesis output goes here',
    });
    expect(msg).toContain('## Debate Context');
    expect(msg).toContain('Step 1 bull thesis output goes here');
  });

  it('includes debate role section when debateRole is provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {
      debateRole: 'bear',
    });
    expect(msg).toContain('## Debate Role');
    expect(msg).toContain('You are acting as the **bear** in this debate.');
  });

  it('omits debate context and role when not provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {});
    expect(msg).not.toContain('## Debate Context');
    expect(msg).not.toContain('## Debate Role');
  });

  it('includes both debate context and role when both provided', () => {
    const msg = buildUserMessage({ ticker: 'SFM' }, {
      debateContext: 'Prior debate steps...',
      debateRole: 'bull_rebuttal',
    });
    expect(msg).toContain('## Debate Context');
    expect(msg).toContain('Prior debate steps...');
    expect(msg).toContain('## Debate Role');
    expect(msg).toContain('**bull_rebuttal**');
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
