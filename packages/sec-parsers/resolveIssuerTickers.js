// Shared CUSIP/issuer → ticker resolution
// Used by both frontend (browser) and Worker (cron jobs).
// No browser APIs (no localStorage, no DOM) — caller provides the ticker index.

// Static CUSIP prefix→ticker overrides for known edge cases that
// can't be resolved by name matching alone.
export const CUSIP_TICKER_OVERRIDES = {
  '829933': 'SIRI',   // SiriusXM Holdings
  '929740': 'WAB',    // Wabtec
  '30231G': 'XOM',    // Exxon Mobil
  '737630': 'PCH',    // PotlatchDeltic
  '302520': 'FNB',    // F.N.B. Corp
  '200340': 'CMA',    // Comerica
  '229899': 'CFR',    // Cullen/Frost Bankers
  '89214P': 'TOWN',   // TowneBank
  '03062T': 'CRMT',   // America's Car-Mart
  '784117': 'SEIC',   // SEI Investments
};

// Common SEC 13F abbreviations → full forms
const SEC_ABBREVIATIONS = {
  PETE: 'PETROLEUM', PETRO: 'PETROLEUM',
  FINL: 'FINANCIAL', FIN: 'FINANCIAL',
  FMRS: 'FARMERS',
  MKT: 'MARKET', MKTS: 'MARKETS',
  HLDGS: 'HOLDINGS', HLDG: 'HOLDING',
  SVCS: 'SERVICES', SVC: 'SERVICE',
  TECH: 'TECHNOLOGY', TECHS: 'TECHNOLOGIES',
  INTL: 'INTERNATIONAL',
  PHARMCL: 'PHARMACEUTICAL', PHARMA: 'PHARMACEUTICAL',
  SOLUTN: 'SOLUTION', SOLUTNS: 'SOLUTIONS',
  MGMT: 'MANAGEMENT',
  AMER: 'AMERICA',
  COMMUN: 'COMMUNICATIONS', COMMUNS: 'COMMUNICATIONS',
  INDS: 'INDUSTRIES', IND: 'INDUSTRIES',
  MFG: 'MANUFACTURING',
  PPTY: 'PROPERTY', PPTYS: 'PROPERTIES',
  RLTY: 'REALTY',
  RES: 'RESOURCES',
  ENTMT: 'ENTERTAINMENT',
  DEV: 'DEVELOPMENT',
  INVT: 'INVESTMENT', INVTS: 'INVESTMENTS',
  SYS: 'SYSTEMS',
  PRODS: 'PRODUCTS', PROD: 'PRODUCT',
  THERA: 'THERAPEUTICS',
  BIOSCIS: 'BIOSCIENCES', BIOSCI: 'BIOSCIENCE',
  ENGR: 'ENERGY',
  GRP: 'GROUP',
  MTG: 'MORTGAGE',
  BANCSHRS: 'BANCSHARES',
  RESTAUR: 'RESTAURANT',
  TRAV: 'TRAVELERS',
  ELEC: 'ELECTRIC',
  ELECTR: 'ELECTRONIC',
  NATL: 'NATIONAL',
  SOUTHN: 'SOUTHERN',
  NORTHN: 'NORTHERN',
  WESTN: 'WESTERN',
  EASTN: 'EASTERN',
  LABS: 'LABORATORIES',
  ASSOC: 'ASSOCIATES',
  INDL: 'INDUSTRIAL',
  INSTRS: 'INSTRUMENTS',
  MNG: 'MINING',
  BKG: 'BANKING',
  BK: 'BANK',
  COS: 'COMPANIES',
  INS: 'INSURANCE',
  MTNS: 'MOUNTAINS',
  FAM: 'FAMILY',
  SOL: 'SOLUTIONS',
  ACCEP: 'ACCEPTANCE',
  RIV: 'RIVER',
  STR: 'STREET',
  COMM: 'COMMERCE',
  AMERN: 'AMERICAN',
  FDS: 'FUNDS',
  BANKERS: 'BANKERS',
  CDA: 'CANADA',
  WTR: 'WATER',
};

const SEC_ABBREV_RE = new RegExp(
  '\\b(' + Object.keys(SEC_ABBREVIATIONS).join('|') + ')\\b', 'g'
);

function expandAbbreviations(name) {
  return name.replace(SEC_ABBREV_RE, m => SEC_ABBREVIATIONS[m] || m);
}

// Strip common suffixes and normalize for fuzzy matching
export function normalizeIssuer(name) {
  return expandAbbreviations((name || '').toUpperCase())
    .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|LP|PLC|NV|SA|SE|AG|GROUP|HOLDINGS|ENTERPRISES|INTERNATIONAL|TECHNOLOGIES)\b/g, '')
    .replace(/\b(CL\s*[A-C]|CLASS\s*[A-C]|SHS|COMMON|ORD|ORDINARY|NEW|THE)\b/g, '')
    .replace(/[.\-]/g, ' ')
    .replace(/[,/()&'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(['OF', 'AND', 'THE', 'IN', 'FOR', 'A', 'AN', 'N', 'DEL']);

/**
 * Resolve tickers for holdings using a 4-tier fuzzy matching strategy.
 * @param {Array} holdings — [{ issuer, cusip, ticker?, ... }]
 * @param {Array} tickerIndex — [{ ticker, name }] from SEC company_tickers.json
 * @returns {Array} holdings with `ticker` populated where possible
 */
export function resolveIssuerTickers(holdings, tickerIndex) {
  if (!tickerIndex || tickerIndex.length === 0) return holdings;

  // Build normalized name→ticker lookup
  const nameIndex = new Map();
  for (const entry of tickerIndex) {
    const norm = normalizeIssuer(entry.name);
    if (norm && !nameIndex.has(norm)) {
      nameIndex.set(norm, entry.ticker);
    }
  }

  return holdings.map(h => {
    if (h.ticker) return h;

    // Tier 1: static CUSIP prefix overrides
    const cusip6 = (h.cusip || '').slice(0, 6);
    if (CUSIP_TICKER_OVERRIDES[cusip6]) {
      return { ...h, ticker: CUSIP_TICKER_OVERRIDES[cusip6] };
    }

    // Tier 2: exact normalized name match
    const normIssuer = normalizeIssuer(h.issuer);
    let ticker = nameIndex.get(normIssuer) || null;

    // Tier 3: startsWith match
    if (!ticker) {
      for (const [norm, t] of nameIndex) {
        if (norm.startsWith(normIssuer) || normIssuer.startsWith(norm)) {
          ticker = t;
          break;
        }
      }
    }

    // Tier 4: token-overlap match (≥50% significant token overlap)
    if (!ticker && normIssuer.length > 2) {
      const issuerTokens = normIssuer.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t));
      if (issuerTokens.length >= 1) {
        let bestScore = 0;
        let bestTicker = null;
        for (const [norm, t] of nameIndex) {
          const edgarTokens = norm.split(' ').filter(tk => tk.length > 1 && !STOP_WORDS.has(tk));
          if (edgarTokens.length === 0) continue;
          const overlap = issuerTokens.filter(tk => edgarTokens.includes(tk)).length;
          if (overlap === 0) continue;
          const score = overlap / Math.max(issuerTokens.length, edgarTokens.length);
          if (score > bestScore && score >= 0.5) {
            bestScore = score;
            bestTicker = t;
          }
        }
        ticker = bestTicker;
      }
    }

    return ticker ? { ...h, ticker } : h;
  });
}
