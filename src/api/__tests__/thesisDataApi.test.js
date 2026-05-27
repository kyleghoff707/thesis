import { describe, it, expect, vi } from 'vitest';
import { fetchDataPacket } from '../thesisDataApi.js';

function validDataPacket(overrides = {}) {
  return {
    ticker: 'AAPL',
    assembledAt: '2026-05-12T12:00:00Z',
    caveats: [],
    ...overrides,
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

describe('fetchDataPacket', () => {
  it('posts uppercase ticker and bearer token to the normalized DataPacket endpoint', async () => {
    const fetchImpl = vi.fn(async () => response({ dataPacket: validDataPacket() }));

    await fetchDataPacket('aapl', {
      apiBaseUrl: 'https://example.test///',
      apiKey: 'test-token',
    }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/datapackets', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ ticker: 'AAPL' }),
    });
  });

  it('returns DataPacket, quality, and cache for a good response', async () => {
    const dataPacket = validDataPacket({ companyInfo: { name: 'Apple Inc.' } });
    const quality = { score: 0.98 };
    const cache = { hit: true };
    const fetchImpl = vi.fn(async () => response({ dataPacket, quality, cache }));

    const result = await fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl });

    expect(result).toEqual({ dataPacket, quality, cache });
  });

  it('accepts hosted DataPackets with peers as an array', async () => {
    const dataPacket = validDataPacket({ peers: [] });
    const fetchImpl = vi.fn(async () => response({ dataPacket }));

    const result = await fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl });

    expect(result.dataPacket.peers).toEqual([]);
  });

  it('rejects HTTP 429 rate limits with retry metadata', async () => {
    const fetchImpl = vi.fn(async () => response({
      error: {
        code: 'RATE_LIMITED',
        message: 'Try again later',
        retryAfterSeconds: 3600,
      },
    }, 429));

    await expect(fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl })).rejects.toMatchObject({
      name: 'ThesisApiError',
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 3600,
    });
  });

  it('throws when an HTTP 200 response is missing dataPacket', async () => {
    const fetchImpl = vi.fn(async () => response({ quality: { score: 1 } }));

    await expect(fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl })).rejects.toThrow(/missing dataPacket/);
  });

  it('throws when DataPacket schema validation fails', async () => {
    const fetchImpl = vi.fn(async () => response({ dataPacket: { ticker: 'AAPL' } }));

    await expect(fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl })).rejects.toThrow(/invalid DataPacket/);
  });

  it('throws a non-JSON error for empty response bodies', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => ''),
    }));

    await expect(fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl })).rejects.toMatchObject({
      code: 'NON_JSON_RESPONSE',
      status: 200,
    });
  });

  it('throws when the API returns a queued DataPacket job', async () => {
    const fetchImpl = vi.fn(async () => response({ jobId: 'job_123' }, 202));

    await expect(fetchDataPacket('AAPL', {
      apiBaseUrl: 'https://example.test',
      apiKey: 'test-token',
    }, { fetchImpl })).rejects.toThrow(/queued DataPacket jobs are not supported/);
  });
});
