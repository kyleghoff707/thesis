import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareData } from '../prepare-data.js';

let tmpDir;
let prevThesisDir;

beforeEach(() => {
  prevThesisDir = process.env.THESIS_DIR;
  tmpDir = mkdtempSync(join(tmpdir(), 'thesis-prepare-data-'));
  process.env.THESIS_DIR = tmpDir;
});

afterEach(() => {
  if (prevThesisDir === undefined) delete process.env.THESIS_DIR;
  else process.env.THESIS_DIR = prevThesisDir;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('prepareData', () => {
  it('fetches an API DataPacket, prepares dependent artifacts, and returns the pitch deck summary', async () => {
    const reportDir = join(tmpDir, 'reports', 'AAPL');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'one-pager.json'), JSON.stringify({ overallVerdict: 'PASS' }));

    const packet = {
      ticker: 'AAPL',
      companyInfo: { name: 'Apple Inc.', cik: '0000320193' },
      financials: { years: [2025, 2024] },
      gurus: {
        count: 1,
        holdings: [{ name: 'Sample Fund', value: 125000000 }],
      },
      filings: [
        { form: '10-K', filingDate: '2026-02-15', accessionNumber: '0000320193-26-000001', primaryDocument: 'aapl-20250927.htm' },
        { form: '10-Q', filingDate: '2025-11-01', accessionNumber: '0000320193-25-000002', primaryDocument: 'aapl-20250628.htm' },
      ],
      caveats: [],
      assembledAt: '2026-05-12T12:00:00Z',
    };
    const quality = { canProceed: true };
    const cache = { hit: false };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({ dataPacket: packet, quality, cache })),
    }));
    const execFileSync = vi.fn((_command, args) => {
      if (args.includes('scripts/preprocess-filings.js')) return '2 succeeded';
      if (args.includes('scripts/data-quality-checkpoint.js')) {
        return JSON.stringify({
          canProceed: true,
          dataPacket: { fieldCount: { populated: 6, total: 6 } },
          filingQuality: { tenKCount: 1, tenQCount: 1 },
        });
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const fetchTranscript = vi.fn(async () => ({ found: true, text: 'Transcript text' }));

    const summary = await prepareData('aapl', {
      config: {
        apiBaseUrl: 'https://api.example.test',
        apiKey: 'thesis_live_key',
      },
      fetchImpl,
      execFileSync,
      fetchTranscript,
    });

    const packetPath = join(reportDir, 'data-packet.json');
    expect(existsSync(packetPath)).toBe(true);
    expect(JSON.parse(readFileSync(packetPath, 'utf8'))).toEqual(packet);
    expect(summary).toMatchObject({
      ticker: 'AAPL',
      checkpointVerdict: 'PROCEED',
      onePagerVerdict: 'PASS',
      guruCount: 1,
      transcriptsSaved: 2,
      transcriptsTotal: 2,
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining(['scripts/preprocess-filings.js', 'AAPL']),
      expect.objectContaining({ timeout: 120000 })
    );
    expect(execFileSync).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining(['scripts/data-quality-checkpoint.js', 'AAPL']),
      expect.objectContaining({ timeout: 120000 })
    );
    expect(fetchTranscript).toHaveBeenCalled();
    expect(readFileSync(new URL('../prepare-data.js', import.meta.url), 'utf8')).not.toContain('dataExport');
  });

  it('parses blocked checkpoint JSON from execFileSync errors', async () => {
    const reportDir = join(tmpDir, 'reports', 'AAPL');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'one-pager.json'), JSON.stringify({ overallVerdict: 'PASS' }));

    const packet = {
      ticker: 'AAPL',
      companyInfo: { name: 'Apple Inc.' },
      financials: { years: [2025] },
      filings: [],
      caveats: [],
      assembledAt: '2026-05-12T12:00:00Z',
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({ dataPacket: packet })),
    }));
    const checkpointOutput = JSON.stringify({
      canProceed: false,
      dataPacket: { fieldCount: { populated: 2, total: 6 } },
      filingQuality: { tenKCount: 0, tenQCount: 0 },
    });
    const execFileSync = vi.fn((_command, args) => {
      if (args.includes('scripts/preprocess-filings.js')) return '0 succeeded';
      if (args.includes('scripts/data-quality-checkpoint.js')) {
        const error = new Error('Command failed');
        error.status = 1;
        error.stdout = checkpointOutput;
        throw error;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const summary = await prepareData('aapl', {
      config: {
        apiBaseUrl: 'https://api.example.test',
        apiKey: 'thesis_live_key',
      },
      fetchImpl,
      execFileSync,
      fetchTranscript: vi.fn(),
    });

    expect(summary.checkpointVerdict).toBe('BLOCKED');
  });

  it('fails loudly when hosted filing metadata cannot support local preprocessing', async () => {
    const reportDir = join(tmpDir, 'reports', 'AAPL');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'one-pager.json'), JSON.stringify({ overallVerdict: 'PASS' }));

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({
        dataPacket: {
          ticker: 'AAPL',
          companyInfo: { name: 'Apple Inc.' },
          filings: [{ form: '10-K', filingDate: '2026-02-15' }],
          caveats: [],
          assembledAt: '2026-05-12T12:00:00Z',
        },
      })),
    }));

    await expect(prepareData('aapl', {
      config: {
        apiBaseUrl: 'https://api.example.test',
        apiKey: 'thesis_live_key',
      },
      fetchImpl,
    })).rejects.toThrow(/filing metadata required for local SEC preprocessing/);
  });

  it('validates every filing selected for local preprocessing', async () => {
    const reportDir = join(tmpDir, 'reports', 'AAPL');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'one-pager.json'), JSON.stringify({ overallVerdict: 'PASS' }));

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({
        dataPacket: {
          ticker: 'AAPL',
          companyInfo: { name: 'Apple Inc.', cik: '0000320193' },
          filings: [
            {
              form: '10-K',
              filingDate: '2026-02-15',
              accessionNumber: '0000320193-26-000001',
              primaryDocument: 'aapl-20250927.htm',
            },
            { form: '10-Q', filingDate: '2025-11-01', accessionNumber: '0000320193-25-000002' },
          ],
          caveats: [],
          assembledAt: '2026-05-12T12:00:00Z',
        },
      })),
    }));

    await expect(prepareData('aapl', {
      config: {
        apiBaseUrl: 'https://api.example.test',
        apiKey: 'thesis_live_key',
      },
      fetchImpl,
    })).rejects.toThrow(/filings\[\]\.primaryDocument/);
  });
});
