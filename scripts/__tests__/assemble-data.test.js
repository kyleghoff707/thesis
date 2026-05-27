import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleDataFromApi } from '../assemble-data.js';

let tmpDir;
let prevThesisDir;

beforeEach(() => {
  prevThesisDir = process.env.THESIS_DIR;
  tmpDir = mkdtempSync(join(tmpdir(), 'thesis-assemble-data-'));
  process.env.THESIS_DIR = tmpDir;
});

afterEach(() => {
  if (prevThesisDir === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = prevThesisDir;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('assembleDataFromApi', () => {
  it('fetches an API DataPacket and writes it to the ticker report directory', async () => {
    const dataPacket = {
      ticker: 'AAPL',
      companyInfo: { name: 'Apple Inc.', cik: '0000320193' },
      financials: { years: [2025, 2024] },
      filings: [{ form: '10-K', filingDate: '2025-10-31', accessionNumber: '0000320193-25-000079', primaryDocument: 'aapl-20250927.htm' }],
      peers: [],
      peerMetrics: { peers: [] },
      caveats: [],
      assembledAt: '2026-05-13T00:00:00.000Z',
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({
        dataPacket,
        quality: { canProceed: true },
        cache: { hit: true },
      })),
    }));

    const summary = await assembleDataFromApi('aapl', {
      config: {
        apiBaseUrl: 'https://api.example.test',
        apiKey: 'thesis_live_key',
      },
      fetchImpl,
    });

    const expectedPath = join(tmpDir, 'reports', 'AAPL', 'data-packet.json');
    expect(summary.outputPath).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);
    const writtenPacket = JSON.parse(readFileSync(expectedPath, 'utf8'));
    expect(writtenPacket).toEqual(dataPacket);
    expect(writtenPacket.peers).toEqual([]);
    expect(summary.quality.canProceed).toBe(true);
    expect(summary.cache.hit).toBe(true);
  });
});
