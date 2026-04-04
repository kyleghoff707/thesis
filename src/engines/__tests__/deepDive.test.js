// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('deepDive engine', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function loadModule(key = 'test-api-key-123') {
    vi.doMock('../config', () => ({ CLAUDE_KEY: key }));
    return import('../deepDive.js');
  }

  it('Test 1: returns { content, error: null } on successful fetch response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: 'Deep analysis of the claim reveals...' }],
      }),
    });

    const { generateDeepDive } = await loadModule();

    const result = await generateDeepDive({
      claim: { text: 'Revenue grew 25%', context: 'Strong growth signal' },
      sectionContext: 'Market Position analysis',
      ticker: 'AAPL',
    });

    expect(result.content).toBe('Deep analysis of the claim reveals...');
    expect(result.error).toBeNull();
  });

  it('Test 2: returns error when CLAUDE_KEY is empty', async () => {
    const { generateDeepDive } = await loadModule('');

    const result = await generateDeepDive({
      claim: { text: 'test', context: 'test' },
      sectionContext: 'test',
      ticker: 'TEST',
    });

    expect(result.content).toBeNull();
    expect(result.error).toBe('Claude API key not configured.');
  });

  it('Test 3: returns error when previousDives.length >= 3', async () => {
    const { generateDeepDive } = await loadModule();

    const result = await generateDeepDive({
      claim: { text: 'test', context: 'test' },
      sectionContext: 'test',
      ticker: 'TEST',
      previousDives: [
        { content: 'dive 1' },
        { content: 'dive 2' },
        { content: 'dive 3' },
      ],
    });

    expect(result.content).toBeNull();
    expect(result.error).toBe('Maximum analysis depth reached.');
  });

  it('Test 4: returns error on non-ok fetch response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const { generateDeepDive } = await loadModule();

    const result = await generateDeepDive({
      claim: { text: 'test', context: 'test' },
      sectionContext: 'test',
      ticker: 'TEST',
    });

    expect(result.content).toBeNull();
    expect(result.error).toBe('API error: 429');
  });

  it('Test 5: returns error on fetch network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const { generateDeepDive } = await loadModule();

    const result = await generateDeepDive({
      claim: { text: 'test', context: 'test' },
      sectionContext: 'test',
      ticker: 'TEST',
    });

    expect(result.content).toBeNull();
    expect(result.error).toBe('Network failure');
  });

  it('Test 6: sends correct headers including anthropic-dangerous-direct-browser-access', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'ok' }] }),
    });

    const { generateDeepDive } = await loadModule();

    await generateDeepDive({
      claim: { text: 'Revenue grew 25%', context: 'Growth signal' },
      sectionContext: 'Market Position',
      ticker: 'AAPL',
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const callArgs = globalThis.fetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.anthropic.com/v1/messages');

    const headers = callArgs[1].headers;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-api-key']).toBe('test-api-key-123');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('Test 7: prompt includes claim text, section context, and previous dives at depth > 1', async () => {
    const { _testExports } = await loadModule();
    const { buildDeepDivePrompt } = _testExports;

    // Depth 1 prompt
    const prompt1 = buildDeepDivePrompt(
      { text: 'Revenue grew 25%', context: 'Strong growth' },
      'Market Position analysis',
      'AAPL',
      [],
      1,
    );
    expect(prompt1).toContain('Revenue grew 25%');
    expect(prompt1).toContain('Strong growth');
    expect(prompt1).toContain('AAPL');
    expect(prompt1).toContain('Market Position analysis');
    expect(prompt1).not.toContain('Previous analysis');

    // Depth 2 prompt with previous dives
    const prompt2 = buildDeepDivePrompt(
      { text: 'Revenue grew 25%', context: 'Strong growth' },
      'Market Position analysis',
      'AAPL',
      [{ content: 'First analysis content' }],
      2,
    );
    expect(prompt2).toContain('Revenue grew 25%');
    expect(prompt2).toContain('Previous analysis');
    expect(prompt2).toContain('First analysis content');
    expect(prompt2).toContain('Go deeper');
  });
});
