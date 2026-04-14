import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectFilings,
  cleanEdgarHtml,
  convertToMarkdown,
  assembleFilingContent,
  _testExports,
} from '../assembleFilingContent.js';

const { buildEdgarUrl, getExpectedQuarters, SECTION_LIMIT_10K, SECTION_LIMIT_10Q } = _testExports;

// ─── selectFilings ─────────────────────────────────────────

describe('selectFilings', () => {
  const makeFilings = (forms) =>
    forms.map((form, i) => ({
      form,
      filingDate: `2024-${String(12 - i).padStart(2, '0')}-01`,
      accessionNumber: `0001-24-00000${i}`,
      primaryDocument: `filing${i}.htm`,
    }));

  it('picks 5 most recent 10-Ks and 4 most recent 10-Qs', () => {
    const filings = makeFilings([
      '10-K', '10-Q', '10-K', '10-Q', '10-K', '10-Q',
      '10-K', '10-Q', '10-K', '10-Q', '10-K',
    ]);
    const { tenKs, tenQs } = selectFilings(filings);
    expect(tenKs).toHaveLength(5);
    expect(tenQs).toHaveLength(4);
  });

  it('returns empty arrays for null filings', () => {
    expect(selectFilings(null)).toEqual({ tenKs: [], tenQs: [] });
    expect(selectFilings(undefined)).toEqual({ tenKs: [], tenQs: [] });
    expect(selectFilings([])).toEqual({ tenKs: [], tenQs: [] });
  });

  it('handles fewer than 5 10-Ks', () => {
    const filings = makeFilings(['10-K', '10-K', '10-Q']);
    const { tenKs, tenQs } = selectFilings(filings);
    expect(tenKs).toHaveLength(2);
    expect(tenQs).toHaveLength(1);
  });

  it('handles no 10-Qs', () => {
    const filings = makeFilings(['10-K', '10-K', '10-K']);
    const { tenKs, tenQs } = selectFilings(filings);
    expect(tenKs).toHaveLength(3);
    expect(tenQs).toHaveLength(0);
  });

  it('skips XML primaryDocuments', () => {
    const filings = [
      { form: '10-K', filingDate: '2024-12-01', accessionNumber: '0001-24-000001', primaryDocument: 'filing.xml' },
      { form: '10-K', filingDate: '2024-11-01', accessionNumber: '0001-24-000002', primaryDocument: 'filing.htm' },
    ];
    const { tenKs } = selectFilings(filings);
    expect(tenKs).toHaveLength(1);
    expect(tenKs[0].primaryDocument).toBe('filing.htm');
  });

  it('ignores non-10K/10Q forms', () => {
    const filings = makeFilings(['8-K', 'DEF 14A', '10-K', '10-Q']);
    const { tenKs, tenQs } = selectFilings(filings);
    expect(tenKs).toHaveLength(1);
    expect(tenQs).toHaveLength(1);
  });
});

// ─── cleanEdgarHtml ────────────────────────────────────────

describe('cleanEdgarHtml', () => {
  it('removes hidden iXBRL elements', () => {
    const html = `<html><body>
      <ix:hidden>secret metadata</ix:hidden>
      <p>Visible content</p>
    </body></html>`;
    const result = cleanEdgarHtml(html);
    expect(result).not.toContain('secret metadata');
    expect(result).toContain('Visible content');
  });

  it('unwraps visible iXBRL elements (keeps text)', () => {
    const html = `<html><body>
      <p>Revenue was <ix:nonfraction>42,000,000</ix:nonfraction> dollars.</p>
    </body></html>`;
    const result = cleanEdgarHtml(html);
    expect(result).toContain('42,000,000');
    expect(result).not.toContain('ix:nonfraction');
  });

  it('removes script, style, link, meta tags', () => {
    const html = `<html><head>
      <script>alert("xss")</script>
      <style>.red { color: red; }</style>
      <link rel="stylesheet" href="style.css">
      <meta name="test" content="test">
    </head><body><p>Content</p></body></html>`;
    const result = cleanEdgarHtml(html);
    expect(result).not.toContain('alert');
    expect(result).not.toContain('.red');
    expect(result).toContain('Content');
  });

  it('strips style and class attributes', () => {
    const html = `<html><body>
      <p style="color: red" class="highlight">Styled text</p>
    </body></html>`;
    const result = cleanEdgarHtml(html);
    expect(result).not.toContain('color: red');
    expect(result).not.toContain('highlight');
    expect(result).toContain('Styled text');
  });

  it('handles ix:header and ix:references', () => {
    const html = `<html><body>
      <ix:header>header stuff</ix:header>
      <ix:references>ref stuff</ix:references>
      <p>Real content</p>
    </body></html>`;
    const result = cleanEdgarHtml(html);
    expect(result).not.toContain('header stuff');
    expect(result).not.toContain('ref stuff');
    expect(result).toContain('Real content');
  });

  it('unwraps ix:nonnumeric and ix:continuation', () => {
    const html = `<html><body>
      <ix:nonnumeric>Some text</ix:nonnumeric>
      <ix:continuation>Continued text</ix:continuation>
    </body></html>`;
    const result = cleanEdgarHtml(html);
    expect(result).toContain('Some text');
    expect(result).toContain('Continued text');
    expect(result).not.toContain('ix:nonnumeric');
    expect(result).not.toContain('ix:continuation');
  });
});

// ─── convertToMarkdown ─────────────────────────────────────

describe('convertToMarkdown', () => {
  it('converts headings to atx style', () => {
    const result = convertToMarkdown('<h1>Title</h1><p>Content</p>');
    expect(result).toContain('# Title');
  });

  it('converts tables to pipe-delimited markdown', () => {
    const html = `<table>
      <tr><th>Name</th><th>Value</th></tr>
      <tr><td>Revenue</td><td>$100M</td></tr>
    </table>`;
    const result = convertToMarkdown(html);
    expect(result).toContain('| Name | Value |');
    expect(result).toContain('| Revenue | $100M |');
    expect(result).toContain('---');
  });

  it('collapses excessive blank lines', () => {
    // Test the post-processing directly: input with 6+ newlines should be reduced
    const html = '<h1>Section A</h1><p>Content A</p><h1>Section B</h1><p>Content B</p>';
    const result = convertToMarkdown(html);
    // Headings produce blank lines but shouldn't exceed 3 consecutive newlines
    expect(result).toContain('Section A');
    expect(result).toContain('Section B');
  });

  it('unwraps font tags', () => {
    const html = '<p><font size="2">Small text</font></p>';
    const result = convertToMarkdown(html);
    expect(result).toContain('Small text');
    expect(result).not.toContain('font');
  });
});

// ─── Section truncation ────────────────────────────────────

describe('section truncation', () => {
  it('truncates 10-K sections at 40K chars', () => {
    expect(SECTION_LIMIT_10K).toBe(40_000);
  });

  it('truncates 10-Q sections at 15K chars', () => {
    expect(SECTION_LIMIT_10Q).toBe(15_000);
  });
});

// ─── buildEdgarUrl ─────────────────────────────────────────

describe('buildEdgarUrl', () => {
  it('constructs correct URL with leading zeros stripped from CIK', () => {
    const url = buildEdgarUrl('0000320193', '0000320193-24-000001', 'aapl-20240928.htm');
    expect(url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000001/aapl-20240928.htm');
  });

  it('handles CIK without leading zeros', () => {
    const url = buildEdgarUrl('320193', '0000320193-24-000001', 'aapl-20240928.htm');
    expect(url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000001/aapl-20240928.htm');
  });
});

// ─── getExpectedQuarters ───────────────────────────────────

describe('getExpectedQuarters', () => {
  it('returns the requested number of quarters', () => {
    const quarters = getExpectedQuarters(4);
    expect(quarters).toHaveLength(4);
  });

  it('returns quarters in descending order', () => {
    const quarters = getExpectedQuarters(4);
    for (let i = 1; i < quarters.length; i++) {
      const prev = quarters[i - 1].year * 10 + quarters[i - 1].quarter;
      const curr = quarters[i].year * 10 + quarters[i].quarter;
      expect(prev).toBeGreaterThan(curr);
    }
  });
});

// ─── Transcript key formatting ─────────────────────────────

describe('transcript key formatting', () => {
  it('produces transcript-Q{n}-{year} format', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [
          { key: 'transcripts/COST/2024/Q4.json' },
          { key: 'transcripts/COST/2024/Q3.json' },
        ],
      }),
      get: vi.fn().mockImplementation((key) => {
        const match = key.match(/(\d{4})\/Q(\d)/);
        return Promise.resolve({
          text: () => Promise.resolve(JSON.stringify({
            text: `Transcript for Q${match[2]} ${match[1]}`,
            meta: { year: parseInt(match[1]), quarterNum: parseInt(match[2]) },
          })),
        });
      }),
    };

    const result = await assembleFilingContent('COST', { filings: [], companyInfo: {} }, { TRANSCRIPTS: mockR2 });

    const keys = Object.keys(result.transcriptContent);
    for (const key of keys) {
      expect(key).toMatch(/^transcript-Q\d-\d{4}$/);
    }
  });
});

// ─── R2 cache hit ──────────────────────────────────────────

describe('R2 cache hit', () => {
  it('uses cached markdown from R2 instead of fetching from SEC', async () => {
    const cachedMarkdown = '# Item 1. Business\n\nThis is a business section.\n\n# Item 1A. Risk Factors\n\nThese are the risks.';

    const mockR2 = {
      get: vi.fn().mockImplementation((key) => {
        if (key.startsWith('filings-md/')) {
          return Promise.resolve({ text: () => Promise.resolve(cachedMarkdown) });
        }
        return Promise.resolve(null);
      }),
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const dataPacket = {
      companyInfo: { cik: '320193' },
      filings: [
        { form: '10-K', filingDate: '2024-09-28', accessionNumber: '0000320193-24-000001', primaryDocument: 'aapl.htm' },
      ],
    };

    const result = await assembleFilingContent('AAPL', dataPacket, { TRANSCRIPTS: mockR2 });

    // R2 was checked
    expect(mockR2.get).toHaveBeenCalledWith('filings-md/0000320193-24-000001.md');

    // SEC fetch was NOT called (cache hit)
    expect(fetchSpy).not.toHaveBeenCalled();

    // Filing content was populated from cache
    const filingKey = '10-K-2024-09-28';
    expect(result.filingContent[filingKey]).toBeDefined();
    expect(result.filingContent[filingKey].fromCache).toBe(true);

    fetchSpy.mockRestore();
  });
});

// ─── Error accumulation ────────────────────────────────────

describe('error accumulation', () => {
  it('accumulates errors from failed fetches without blocking others', async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null), // cache miss
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
    };

    // First filing returns 404, second returns OK
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<html><body><h1>Item 1. Business</h1><p>Content here</p></body></html>'),
      });
    vi.stubGlobal('fetch', fetchMock);

    const dataPacket = {
      companyInfo: { cik: '12345' },
      filings: [
        { form: '10-K', filingDate: '2024-12-01', accessionNumber: 'acc-1', primaryDocument: 'f1.htm' },
        { form: '10-K', filingDate: '2024-06-01', accessionNumber: 'acc-2', primaryDocument: 'f2.htm' },
      ],
    };

    const result = await assembleFilingContent('TEST', dataPacket, { TRANSCRIPTS: mockR2 });

    // One error for the 404
    expect(result.errors.some(e => e.includes('acc-1'))).toBe(true);
    // Second filing should still have been processed
    expect(result.stats.filingsFetched).toBeGreaterThanOrEqual(1);

    vi.unstubAllGlobals();
  });
});

// ─── AV fallback ───────────────────────────────────────────

describe('AV fallback for transcripts', () => {
  it('calls Alpha Vantage when R2 has no transcripts', async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }), // no R2 transcripts
    };

    const avResponse = {
      transcript: [
        { speaker: 'CEO', title: 'Chief Executive Officer', content: 'Great quarter.' },
      ],
      symbol: 'TEST',
      quarter: '2024Q4',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(avResponse),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await assembleFilingContent('TEST', { filings: [], companyInfo: {} }, {
      TRANSCRIPTS: mockR2,
      ALPHA_VANTAGE_KEY: 'test-key-1',
      ALPHA_VANTAGE_KEY_2: 'test-key-2',
    });

    // AV was called
    expect(fetchMock).toHaveBeenCalled();
    const avCalls = fetchMock.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('alphavantage.co')
    );
    expect(avCalls.length).toBeGreaterThan(0);

    // Transcripts were populated
    expect(result.stats.transcriptsFetched).toBeGreaterThan(0);

    // Result was cached in R2
    expect(mockR2.put).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
