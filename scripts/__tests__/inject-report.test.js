import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STAGE_FILES,
  VALID_STAGES,
  buildPayload,
  inlineDebatePaths,
  loadStage,
  main,
  parseArgs,
  postReport,
  resolveStagePath,
} from '../inject-report.mjs';

function withTempThesisDir(prefix) {
  const previous = process.env.THESIS_DIR;
  const root = mkdtempSync(join(tmpdir(), prefix));
  process.env.THESIS_DIR = root;
  return {
    root,
    cleanup() {
      if (previous === undefined) delete process.env.THESIS_DIR;
      else process.env.THESIS_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeStage(root, ticker, filename, data) {
  const tickerDir = join(root, 'reports', ticker);
  mkdirSync(tickerDir, { recursive: true });
  writeFileSync(join(tickerDir, filename), JSON.stringify(data));
  return tickerDir;
}

describe('stage constants', () => {
  it('exports the expected stage map', () => {
    expect(STAGE_FILES).toEqual({
      onePager: 'one-pager.json',
      pitchDeck: 'pitch-deck.json',
      finalThesis: 'final-thesis.json',
    });
    expect(VALID_STAGES).toEqual(['onePager', 'pitchDeck', 'finalThesis']);
  });
});

describe('parseArgs', () => {
  it('extracts a single --ticker value and uppercases it', () => {
    const args = parseArgs(['node', 'inject.mjs', '--ticker', 'aapl']);
    expect(args.ticker).toBe('AAPL');
    expect(args.help).toBe(false);
  });

  it('supports -t shorthand for ticker', () => {
    expect(parseArgs(['node', 'inject.mjs', '-t', 'msft']).ticker).toBe('MSFT');
  });

  it('records --api-base-url override and strips trailing slashes', () => {
    const args = parseArgs(['node', 'inject.mjs', '--ticker', 'AAPL', '--api-base-url', 'http://localhost:8787///']);
    expect(args.apiBaseUrl).toBe('http://localhost:8787');
  });

  it('records --api-key override', () => {
    const args = parseArgs(['node', 'inject.mjs', '--ticker', 'AAPL', '--api-key', 'override_key']);
    expect(args.apiKey).toBe('override_key');
  });

  it('returns help=true on --help or -h', () => {
    expect(parseArgs(['node', 'inject.mjs', '--help']).help).toBe(true);
    expect(parseArgs(['node', 'inject.mjs', '-h']).help).toBe(true);
  });

  it('throws on unknown flags', () => {
    expect(() => parseArgs(['node', 'inject.mjs', '--ticker', 'AAPL', '--bogus'])).toThrow(/Unknown argument/);
  });

  it('throws when --ticker is missing', () => {
    expect(() => parseArgs(['node', 'inject.mjs'])).toThrow(/--ticker is required/);
  });

  it('throws when --ticker is provided more than once', () => {
    expect(() => parseArgs(['node', 'inject.mjs', '--ticker', 'AAPL', '-t', 'MSFT'])).toThrow(/only be provided once/);
  });

  it('throws when a flag value is missing', () => {
    expect(() => parseArgs(['node', 'inject.mjs', '--ticker', '-h'])).toThrow(/requires a value/);
  });
});

describe('resolveStagePath', () => {
  let tmp;

  beforeEach(() => {
    tmp = withTempThesisDir('thesis-inject-resolve-');
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it('returns the working-dir path when the file exists', () => {
    const tickerDir = writeStage(tmp.root, 'AAPL', 'one-pager.json', {});

    expect(resolveStagePath('AAPL', 'onePager')).toEqual({
      path: join(tickerDir, 'one-pager.json'),
      source: 'working',
    });
  });

  it('falls back to the newest archive directory when working file is missing', () => {
    const archiveRoot = join(tmp.root, 'reports', 'AAPL', 'archive');
    mkdirSync(join(archiveRoot, '20260101-120000-AAPL-onePager'), { recursive: true });
    mkdirSync(join(archiveRoot, '20260513-142301-AAPL-onePager'), { recursive: true });
    writeFileSync(join(archiveRoot, '20260101-120000-AAPL-onePager', 'one-pager.json'), '{}');
    writeFileSync(join(archiveRoot, '20260513-142301-AAPL-onePager', 'one-pager.json'), '{}');

    const result = resolveStagePath('AAPL', 'onePager');
    expect(result.source).toBe('archive/20260513-142301-AAPL-onePager');
    expect(result.path).toBe(join(archiveRoot, '20260513-142301-AAPL-onePager', 'one-pager.json'));
  });

  it('falls back to the newest plain timestamp archive directory used by generators', () => {
    const archiveRoot = join(tmp.root, 'reports', 'AAPL', 'archive');
    mkdirSync(join(archiveRoot, '20260101-120000'), { recursive: true });
    mkdirSync(join(archiveRoot, '20260513-142301'), { recursive: true });
    writeFileSync(join(archiveRoot, '20260101-120000', 'one-pager.json'), '{}');
    writeFileSync(join(archiveRoot, '20260513-142301', 'one-pager.json'), '{}');

    const result = resolveStagePath('AAPL', 'onePager');
    expect(result.source).toBe('archive/20260513-142301');
    expect(result.path).toBe(join(archiveRoot, '20260513-142301', 'one-pager.json'));
  });

  it('ignores archive dirs that do not match the ticker-stage suffix', () => {
    const archiveRoot = join(tmp.root, 'reports', 'AAPL', 'archive');
    mkdirSync(join(archiveRoot, '20260513-142301-AAPL-pitchDeck'), { recursive: true });
    writeFileSync(join(archiveRoot, '20260513-142301-AAPL-pitchDeck', 'pitch-deck.json'), '{}');

    expect(resolveStagePath('AAPL', 'onePager')).toBe(null);
  });

  it('returns null when neither working nor archive exists', () => {
    expect(resolveStagePath('AAPL', 'onePager')).toBe(null);
  });
});

describe('inlineDebatePaths', () => {
  let tmp;
  let previousCwd;

  beforeEach(() => {
    tmp = withTempThesisDir('thesis-inject-debate-');
    previousCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    tmp.cleanup();
  });

  it('inlines all 4 debate steps as the whole parsed file (renderer reads .content)', () => {
    const tickerDir = join(tmp.root, 'reports', 'AAPL');
    const sectionsDir = join(tickerDir, 'sections');
    mkdirSync(sectionsDir, { recursive: true });
    // Debate-step files are enveloped: { step, role, ..., content: <debate data> } — match production shape.
    writeFileSync(join(sectionsDir, 'debate-step-1-bull.json'), JSON.stringify({ step: 1, role: 'bull', content: { thesisPoints: ['p1'] } }));
    writeFileSync(join(sectionsDir, 'debate-step-2-bear.json'), JSON.stringify({ step: 2, role: 'bear', content: { inversions: ['i1'] } }));
    writeFileSync(join(sectionsDir, 'debate-step-3-rebuttal.json'), JSON.stringify({ step: 3, role: 'rebuttal', content: { rebuttals: ['r1'] } }));
    writeFileSync(join(sectionsDir, 'debate-step-4-judge.json'), JSON.stringify({ step: 4, role: 'judge', content: { overallVerdict: { direction: 'Mixed' } } }));

    const result = inlineDebatePaths({
      debate: {
        step1Bull: 'sections/debate-step-1-bull.json',
        step2Bear: 'sections/debate-step-2-bear.json',
        step3Rebuttal: 'sections/debate-step-3-rebuttal.json',
        step4Judge: 'sections/debate-step-4-judge.json',
      },
    }, join(tickerDir, 'final-thesis.json'));

    // The whole parsed file is assigned directly — NOT re-wrapped in another { content: ... }.
    expect(result.debate.step1Bull).toEqual({ step: 1, role: 'bull', content: { thesisPoints: ['p1'] } });
    expect(result.debate.step4Judge).toEqual({ step: 4, role: 'judge', content: { overallVerdict: { direction: 'Mixed' } } });
    // Renderer reads stepXxx.content and must find the debate data there, not metadata.
    expect(result.debate.step1Bull.content).toEqual({ thesisPoints: ['p1'] });
    expect(result.debate.step2Bear.content).toEqual({ inversions: ['i1'] });
    // Regression guard: the data must NOT be double-nested at .content.content.
    expect(result.debate.step1Bull.content.content).toBeUndefined();
  });

  it('leaves path strings intact when files are missing', () => {
    const tickerDir = join(tmp.root, 'reports', 'AAPL');
    mkdirSync(tickerDir, { recursive: true });

    const result = inlineDebatePaths({
      debate: {
        step1Bull: 'sections/debate-step-1-bull.json',
        step2Bear: 'sections/debate-step-2-bear.json',
      },
    }, join(tickerDir, 'final-thesis.json'));

    expect(result.debate.step1Bull).toBe('sections/debate-step-1-bull.json');
    expect(result.debate.step2Bear).toBe('sections/debate-step-2-bear.json');
  });

  it('falls through to the next candidate path when one is malformed JSON', () => {
    const tickerDir = join(tmp.root, 'reports', 'AAPL');
    mkdirSync(tickerDir, { recursive: true });
    writeFileSync(join(tickerDir, 'debate-step-1-bull.json'), '{ not json');
    writeFileSync(join(tmp.root, 'debate-step-1-bull.json'), JSON.stringify({ side: 'bull' }));
    process.chdir(tmp.root);

    const result = inlineDebatePaths({
      debate: { step1Bull: 'debate-step-1-bull.json' },
    }, join(tickerDir, 'final-thesis.json'));

    expect(result.debate.step1Bull).toEqual({ side: 'bull' });
  });

  it('inlines debate files copied into the archive root', () => {
    const archiveDir = join(tmp.root, 'reports', 'AAPL', 'archive', '20260513-142301');
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, 'debate-step-1-bull.json'), JSON.stringify({ side: 'bull' }));

    const result = inlineDebatePaths({
      debate: { step1Bull: 'sections/debate-step-1-bull.json' },
    }, join(archiveDir, 'final-thesis.json'));

    expect(result.debate.step1Bull).toEqual({ side: 'bull' });
  });

  it('prefers archived debate files over current cache paths for archived final thesis', () => {
    const archiveDir = join(tmp.root, 'reports', 'AAPL', 'archive', '20260513-142301');
    const cacheSectionsDir = join(tmp.root, 'cache', 'AAPL', 'sections');
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(cacheSectionsDir, { recursive: true });
    writeFileSync(join(archiveDir, 'debate-step-1-bull.json'), JSON.stringify({ side: 'archived' }));
    writeFileSync(join(cacheSectionsDir, 'debate-step-1-bull.json'), JSON.stringify({ side: 'current-cache' }));

    const result = inlineDebatePaths({
      debate: { step1Bull: join(cacheSectionsDir, 'debate-step-1-bull.json') },
    }, join(archiveDir, 'final-thesis.json'));

    expect(result.debate.step1Bull).toEqual({ side: 'archived' });
  });

  it('leaves strings intact when every candidate is malformed', () => {
    const tickerDir = join(tmp.root, 'reports', 'AAPL');
    const sectionsDir = join(tickerDir, 'sections');
    mkdirSync(sectionsDir, { recursive: true });
    writeFileSync(join(sectionsDir, 'debate-step-1-bull.json'), '{ not valid json');

    const result = inlineDebatePaths({
      debate: { step1Bull: 'sections/debate-step-1-bull.json' },
    }, join(tickerDir, 'final-thesis.json'));

    expect(result.debate.step1Bull).toBe('sections/debate-step-1-bull.json');
  });

  it('is a no-op when raw.debate is absent', () => {
    const raw = { sections: [{ id: 's1' }] };
    const result = inlineDebatePaths(raw, join(tmp.root, 'reports', 'AAPL', 'final-thesis.json'));
    expect(result).toEqual(raw);
  });

  it('skips debate values that are not path strings', () => {
    const result = inlineDebatePaths({
      debate: {
        step1Bull: { content: { side: 'bull' } },
        step2Bear: null,
      },
    }, join(tmp.root, 'reports', 'AAPL', 'final-thesis.json'));

    expect(result.debate.step1Bull).toEqual({ content: { side: 'bull' } });
    expect(result.debate.step2Bear).toBe(null);
  });
});

describe('loadStage', () => {
  let tmp;
  let warnSpy;
  let logSpy;

  beforeEach(() => {
    tmp = withTempThesisDir('thesis-inject-load-');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    tmp.cleanup();
  });

  it('returns null and warns when the stage file is missing entirely', () => {
    expect(loadStage('AAPL', 'onePager')).toBe(null);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/skipped onePager/));
  });

  it('returns null and warns when the file has no sections', () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', { sections: [] });

    expect(loadStage('AAPL', 'onePager')).toBe(null);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/no sections/));
  });

  it('returns parsed JSON when the file is well-formed', () => {
    const data = { companyName: 'Apple Inc.', sections: [{ id: 's1' }] };
    writeStage(tmp.root, 'AAPL', 'one-pager.json', data);

    expect(loadStage('AAPL', 'onePager')).toEqual(data);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/loaded onePager from working/));
  });

  it('inlines debate paths for finalThesis stage', () => {
    const tickerDir = join(tmp.root, 'reports', 'AAPL');
    const sectionsDir = join(tickerDir, 'sections');
    mkdirSync(sectionsDir, { recursive: true });
    writeFileSync(join(sectionsDir, 'debate-step-1-bull.json'), JSON.stringify({ side: 'bull' }));
    writeFileSync(join(tickerDir, 'final-thesis.json'), JSON.stringify({
      sections: [{ id: 's1' }],
      debate: { step1Bull: 'sections/debate-step-1-bull.json' },
    }));

    const result = loadStage('AAPL', 'finalThesis');
    expect(result.debate.step1Bull).toEqual({ side: 'bull' });
  });
});

describe('buildPayload', () => {
  it('extracts companyName from onePager first', () => {
    const payload = buildPayload('AAPL', {
      onePager: { companyName: 'Apple Inc.', sections: [] },
      pitchDeck: { companyName: 'Apple From Pitch Deck', sections: [] },
    });

    expect(payload.companyName).toBe('Apple Inc.');
    expect(payload.ticker).toBe('AAPL');
  });

  it('falls back to pitchDeck when onePager lacks companyName', () => {
    const payload = buildPayload('AAPL', {
      onePager: { sections: [] },
      pitchDeck: { companyName: 'Apple From Pitch Deck', sections: [] },
    });

    expect(payload.companyName).toBe('Apple From Pitch Deck');
  });

  it('falls back to finalThesis when neither onePager nor pitchDeck has it', () => {
    const payload = buildPayload('AAPL', {
      finalThesis: { companyName: 'Apple From Final', sections: [] },
    });

    expect(payload.companyName).toBe('Apple From Final');
  });

  it('falls back to ticker when no stage has a companyName', () => {
    const payload = buildPayload('AAPL', {
      onePager: { sections: [] },
    });

    expect(payload.companyName).toBe('AAPL');
  });

  it('includes the stages object verbatim', () => {
    const stages = {
      onePager: { companyName: 'Apple Inc.', sections: [{ id: 's1' }] },
    };

    expect(buildPayload('AAPL', stages).stages).toEqual(stages);
  });
});

describe('postReport', () => {
  it('POSTs to {apiBaseUrl}/v1/reports with Bearer auth and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reportId: 'rpt_1',
        ticker: 'AAPL',
        created: true,
        stagesWritten: ['onePager'],
        url: 'https://thesis-investing.com/reports/AAPL',
      }),
    });
    const payload = { ticker: 'AAPL', companyName: 'Apple Inc.', stages: {} };

    const result = await postReport({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test',
      payload,
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.thesis-investing.com/v1/reports',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer thesis_live_test',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      }),
    );
    expect(result.reportId).toBe('rpt_1');
  });

  it('throws a friendly error on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'INVALID_API_KEY', message: 'API key not recognized' } }),
    });

    await expect(postReport({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'bad',
      payload: {},
      fetchImpl: fetchMock,
    })).rejects.toThrow(/API key was rejected/);
  });

  it('throws a friendly error on 429 with retryAfterSeconds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'slow down', retryAfterSeconds: 60 } }),
    });

    await expect(postReport({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'k',
      payload: {},
      fetchImpl: fetchMock,
    })).rejects.toThrow(/Rate-limited.*60/);
  });

  it('throws a friendly error on 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: 'UNAVAILABLE', message: 'down' } }),
    });

    await expect(postReport({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'k',
      payload: { ticker: 'AAPL' },
      fetchImpl: fetchMock,
    })).rejects.toThrow(/Server error \(503\)/);
  });

  it('throws a friendly error on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(postReport({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'k',
      payload: {},
      fetchImpl: fetchMock,
    })).rejects.toThrow('Could not reach https://api.thesis-investing.com. Check your connection.');
  });
});

describe('main', () => {
  let tmp;
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    tmp = withTempThesisDir('thesis-inject-main-');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    tmp.cleanup();
  });

  it('exits with code 0 and POSTs when at least one stage exists and is written', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test',
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reportId: 'rpt_1',
        ticker: 'AAPL',
        created: true,
        stagesWritten: ['onePager'],
        url: 'https://thesis-investing.com/reports/AAPL',
      }),
    });

    const code = await main(['node', 'inject.mjs', '--ticker', 'AAPL'], { fetchImpl: fetchMock });

    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/Injected to your Thesis account\. View: https:\/\/thesis-investing\.com\/reports\/AAPL/);
  });

  it('exits with code 1 when the ticker directory does not exist', async () => {
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test',
    }));
    const fetchMock = vi.fn();

    const code = await main(['node', 'inject.mjs', '--ticker', 'XYZ'], { fetchImpl: fetchMock });

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/No report found for XYZ/));
  });

  it('exits with code 1 when apiKey is missing from config', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: '',
    }));
    const fetchMock = vi.fn();

    const code = await main(['node', 'inject.mjs', '--ticker', 'AAPL'], { fetchImpl: fetchMock });

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/No API key configured/));
  });

  it('exits with code 1 when config cannot be parsed', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), '{ not json');
    const fetchMock = vi.fn();

    const code = await main(['node', 'inject.mjs', '--ticker', 'AAPL'], { fetchImpl: fetchMock });

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Could not parse/));
  });

  it('allows CLI apiKey and apiBaseUrl overrides', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: '',
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stagesWritten: ['onePager'], created: false }),
    });

    const code = await main([
      'node',
      'inject.mjs',
      '--ticker',
      'AAPL',
      '--api-base-url',
      'http://localhost:8787///',
      '--api-key',
      'override_key',
    ], { fetchImpl: fetchMock });

    expect(code).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8787/v1/reports');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer override_key');
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/Updated existing report\./);
  });

  it('prints "Created new report" when server returns created: true', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test',
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stagesWritten: ['onePager'], created: true }),
    });

    await main(['node', 'inject.mjs', '--ticker', 'AAPL'], { fetchImpl: fetchMock });

    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/Created new report\./);
  });

  it('exits with code 0 and prints help text on --help', async () => {
    const code = await main(['node', 'inject.mjs', '--help'], { fetchImpl: vi.fn() });

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Usage: node scripts\/inject-report\.mjs/));
  });

  it('exits with code 1 when server writes no stages', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test',
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stagesWritten: [], created: false }),
    });

    await expect(main(['node', 'inject.mjs', '--ticker', 'AAPL'], { fetchImpl: fetchMock })).resolves.toBe(1);
    expect(logSpy.mock.calls.flat().join('\n')).not.toMatch(/Injected to/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/No stages were written/));
  });

  it('substitutes accountEmail into the confirmation line when present', async () => {
    writeStage(tmp.root, 'AAPL', 'one-pager.json', {
      companyName: 'Apple Inc.',
      sections: [{ id: 's1' }],
    });
    writeFileSync(join(tmp.root, 'config.json'), JSON.stringify({
      apiBaseUrl: 'https://api.thesis-investing.com',
      apiKey: 'thesis_live_test',
      accountEmail: 'user@example.com',
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reportId: 'rpt_1',
        ticker: 'AAPL',
        created: true,
        stagesWritten: ['onePager'],
      }),
    });

    await main(['node', 'inject.mjs', '--ticker', 'AAPL'], { fetchImpl: fetchMock });

    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/Injected to user@example\.com/);
  });
});
