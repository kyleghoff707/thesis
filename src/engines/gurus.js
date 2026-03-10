// Guru 13F Engine — fetches institutional holdings from SEC EDGAR
// 13F filings are quarterly, delayed 45 days. Long equity only (no shorts, options, or non-US).

import { cacheGet, cacheSet } from './cache';

// EDGAR requires a User-Agent header with app name + contact email
const EDGAR_HEADERS = {
  'User-Agent': 'StockAnalyzer/1.0 (stock-analyzer@local.app)',
  'Accept-Encoding': 'gzip, deflate',
};

// ============================================================
// Guru List — CIK numbers verified against live EDGAR data
// ============================================================

export const GURUS = [
  { name: 'Bill Ackman', fund: 'Pershing Square Capital Management', cik: '0001336528' },
  { name: 'Jeffrey Ubben', fund: 'Inclusive Capital Partners', cik: '0001817187' },
  { name: 'Pat Dorsey', fund: 'Dorsey Asset Management', cik: '0001671657' },
  { name: 'Michael Larson', fund: 'Bill & Melinda Gates Foundation Trust', cik: '0001166559' },
  { name: 'Norbert Lou', fund: 'Punch Card Management', cik: '0001631664' },
  { name: 'Bruce Berkowitz', fund: 'Fairholme Capital Management', cik: '0001056831' },
  { name: 'Alex Roepers', fund: 'Atlantic Investment Management', cik: '0001063296' },
  { name: 'Fred Martin', fund: 'Disciplined Growth Investors', cik: '0001050442' },
  { name: 'Li Lu', fund: 'Himalaya Capital Management', cik: '0001709323' },
  { name: 'Glenn Greenberg', fund: 'Brave Warrior Advisors', cik: '0001553733' },
  { name: 'David Einhorn', fund: 'Greenlight Capital', cik: '0001079114' },
  { name: 'Ako Capital', fund: 'Ako Capital LLP', cik: '0001376879' },
  { name: 'Stephen Mandel', fund: 'Lone Pine Capital', cik: '0001061165' },
  { name: 'Terry Smith', fund: 'Fundsmith LLP', cik: '0001569205' },
  { name: 'David Rolfe', fund: 'Wedgewood Partners', cik: '0000859804' },
  { name: 'Mason Hawkins', fund: 'Southeastern Asset Management', cik: '0000807985' },
  { name: 'Greg Alexander', fund: 'Conifer Management', cik: '0001773994' },
  { name: 'David Abrams', fund: 'Abrams Capital Management', cik: '0001358706' },
  { name: 'Seth Klarman', fund: 'Baupost Group', cik: '0001061768' },
  { name: 'Chuck Akre', fund: 'Akre Capital Management', cik: '0001112520' },
  { name: 'Francis Chou', fund: 'Chou Associates Management', cik: '0001389403' },
  { name: 'Mohnish Pabrai', fund: 'Dalal Street LLC', cik: '0001549575' },
  { name: 'Kahn Brothers', fund: 'Kahn Brothers Group', cik: '0001039565' },
  { name: 'Wallace Weitz', fund: 'Weitz Investment Management', cik: '0000883965' },
  { name: 'Harry Burn', fund: 'Sound Shore Management', cik: '0000820124' },
  { name: 'Chris Davis', fund: 'Davis Selected Advisers', cik: '0001036325' },
  { name: 'Ronald Muhlenkamp', fund: 'Muhlenkamp & Co.', cik: '0001133219' },
  { name: 'Donald Yacktman', fund: 'Yacktman Asset Management', cik: '0000905567' },
  { name: 'Lindsell Train', fund: 'Lindsell Train Ltd', cik: '0001484150' },
  { name: 'Carl Icahn', fund: 'Icahn Capital LP', cik: '0001412093' },
  { name: 'Prem Watsa', fund: 'Fairfax Financial Holdings', cik: '0000915191' },
  { name: 'Nelson Peltz', fund: 'Trian Fund Management', cik: '0001345471' },
  { name: 'Daniel Loeb', fund: 'Third Point LLC', cik: '0001040273' },
  { name: 'Chris Hohn', fund: 'TCI Fund Management', cik: '0001647251' },
  { name: 'Warren Buffett', fund: 'Berkshire Hathaway', cik: '0001067983' },
  { name: 'Chris Bloomstran', fund: 'Semper Augustus Investments Group', cik: '0001115373' },
  { name: 'Guy Spier', fund: 'Aquamarine Capital Management', cik: '0001404599' },
  { name: 'Tweedy Browne', fund: 'Tweedy, Browne Co. LLC', cik: '0000732905' },
  { name: 'William Von Mueffling', fund: 'Cantillon Capital Management', cik: '0001279936' },
  { name: 'Michael Burry', fund: 'Scion Asset Management', cik: '0001649339' },
  { name: 'David Tepper', fund: 'Appaloosa LP', cik: '0001656456' },
];

// ============================================================
// Fetch a guru's latest 13F holdings
// ============================================================

// Step 1: Get the latest 13F-HR filing accession number from EDGAR submissions
async function getLatest13F(cik) {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, { headers: EDGAR_HEADERS });
  if (!res.ok) throw new Error(`EDGAR submissions error: ${res.status}`);

  const data = await res.json();
  const filings = data.filings?.recent;
  if (!filings) return null;

  // Find the most recent 13F-HR filing
  for (let i = 0; i < filings.form.length; i++) {
    if (filings.form[i] === '13F-HR') {
      return {
        accessionNumber: filings.accessionNumber[i],
        filingDate: filings.filingDate[i],
        reportDate: filings.reportDate[i],
        primaryDocument: filings.primaryDocument[i],
      };
    }
  }
  return null;
}

// Step 2: Fetch the filing index to find the infotable XML
async function getInfoTableUrl(cik, accessionNumber) {
  const accessionPath = accessionNumber.replace(/-/g, '');
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${accessionPath}/index.json`;
  const res = await fetch(indexUrl, { headers: EDGAR_HEADERS });
  if (!res.ok) throw new Error(`EDGAR index error: ${res.status}`);

  const data = await res.json();
  const items = data.directory?.item || [];

  // Look for the infotable XML file
  // Named "infotable.xml" in most filings, but some use numbered names like "50240.xml"
  const infoFile = items.find(f =>
    f.name.toLowerCase().includes('infotable') && f.name.endsWith('.xml')
  ) || items.find(f =>
    f.name.endsWith('.xml') &&
    !f.name.includes('primary') &&
    !f.name.includes('index') &&
    !f.name.startsWith('R')
  );

  if (!infoFile) return null;

  const basePath = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${accessionPath}`;
  return `${basePath}/${infoFile.name}`;
}

// Step 3: Parse the 13F infotable XML into holdings
// Note: 13F XML uses namespaces, so getElementsByTagName is more reliable than querySelector
function parseInfoTable(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // getElementsByTagName ignores namespace prefixes — works for all 13F formats
  const entries = doc.getElementsByTagName('infoTable');
  const holdings = [];

  for (const entry of entries) {
    const getText = (tag) => {
      const el = entry.getElementsByTagName(tag)[0];
      return el?.textContent?.trim() || null;
    };

    holdings.push({
      issuer: getText('nameOfIssuer'),
      titleOfClass: getText('titleOfClass'),
      cusip: getText('cusip'),
      value: parseFloat(getText('value')) || 0, // Value is in dollars (verified against live data)
      shares: parseInt(getText('sshPrnamt')) || 0,
      shareType: getText('sshPrnamtType'), // SH = shares, PRN = principal
      discretion: getText('investmentDiscretion'),
      votingSole: parseInt(getText('Sole')) || 0,
      votingShared: parseInt(getText('Shared')) || 0,
      votingNone: parseInt(getText('None')) || 0,
    });
  }

  return holdings;
}

// Main function: fetch a guru's full portfolio
export async function fetchGuruHoldings(guru) {
  const cacheKey = `guru:${guru.cik}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const filing = await getLatest13F(guru.cik);
  if (!filing) return { guru, holdings: [], filing: null, error: 'No 13F-HR filing found' };

  const xmlUrl = await getInfoTableUrl(guru.cik, filing.accessionNumber);
  if (!xmlUrl) return { guru, holdings: [], filing, error: 'Could not find infotable XML' };

  const xmlRes = await fetch(xmlUrl, { headers: EDGAR_HEADERS });
  if (!xmlRes.ok) return { guru, holdings: [], filing, error: `XML fetch failed: ${xmlRes.status}` };

  const xmlText = await xmlRes.text();
  const holdings = parseInfoTable(xmlText);

  // Compute portfolio-level stats
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const enriched = holdings
    .map(h => ({
      ...h,
      portfolioPct: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value); // Sort by position size

  const result = {
    guru,
    filing,
    holdings: enriched,
    totalValue,
    positionCount: enriched.length,
  };

  // Cache for 7 days (13F data only changes quarterly)
  cacheSet(cacheKey, result, 'financials');
  return result;
}

// ============================================================
// Search functions
// ============================================================

// Which gurus own a specific stock? (search by issuer name or CUSIP)
// guruPortfolios: array of fetchGuruHoldings() results (pre-cached)
export function findGurusOwning(guruPortfolios, query) {
  const q = query.toUpperCase();

  return guruPortfolios
    .map(gp => {
      const matches = gp.holdings.filter(h =>
        h.issuer?.toUpperCase().includes(q) ||
        h.cusip === q
      );
      if (matches.length === 0) return null;
      return {
        guru: gp.guru,
        filing: gp.filing,
        positions: matches,
        totalPortfolioValue: gp.totalValue,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Sort by largest position in the stock
      const aVal = Math.max(...a.positions.map(p => p.value));
      const bVal = Math.max(...b.positions.map(p => p.value));
      return bVal - aVal;
    });
}

// Fetch all guru portfolios (with rate limiting for EDGAR's 10 req/sec)
export async function fetchAllGuruHoldings(onProgress) {
  const results = [];
  for (let i = 0; i < GURUS.length; i++) {
    try {
      const result = await fetchGuruHoldings(GURUS[i]);
      results.push(result);
    } catch (err) {
      results.push({ guru: GURUS[i], holdings: [], error: err.message });
    }

    if (onProgress) onProgress(i + 1, GURUS.length, GURUS[i].name);

    // Rate limit: EDGAR allows 10 req/sec, we make ~3 requests per guru
    // Space them out to stay well under the limit
    if (i < GURUS.length - 1) {
      await sleep(350);
    }
  }
  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
