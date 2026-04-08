/**
 * fmp-comp-collector.mjs — Fetch FMP executive compensation data
 *
 * Fetches from FMP's governance-executive-compensation endpoint and
 * caches to disk. Returns normalized array of executive compensation records.
 */

import { readCache, writeCache, isExpired } from './disk-cache.mjs';

const FMP_BASE = 'https://financialmodelingprep.com/stable';

/**
 * Fetch FMP executive compensation data for a ticker.
 *
 * @param {string} ticker
 * @param {{ apiKey: string, cacheDir: string, cacheTtlMs?: number }} options
 * @returns {Array<{ name, title, year, salary, bonus, stockAward, optionAward, incentivePlan, otherComp, total }>|null}
 */
export async function fetchFmpCompensation(ticker, { apiKey, cacheDir, cacheTtlMs = 7 * 24 * 60 * 60 * 1000 }) {
  const cacheKey = `${ticker.toUpperCase()}-comp`;
  const cached = readCache(cacheDir, cacheKey);

  if (cached && !isExpired(cached, cacheTtlMs)) {
    return cached.data;
  }

  const url = `${FMP_BASE}/governance-executive-compensation?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const raw = await resp.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    // Normalize FMP records
    const records = raw.map(r => {
      // Split nameAndPosition into name + title
      const namePos = r.nameAndPosition || '';
      const { name, title } = splitNameAndTitle(namePos);

      return {
        name,
        title,
        year: r.year,
        salary: r.salary ?? null,
        bonus: r.bonus ?? null,
        stockAward: r.stockAward ?? null,
        optionAward: r.optionAward ?? null,
        incentivePlan: r.incentivePlanCompensation ?? null,
        otherComp: r.allOtherCompensation ?? null,
        total: r.total ?? null,
      };
    });

    writeCache(cacheDir, cacheKey, records);
    return records;
  } catch (err) {
    return null;
  }
}

/**
 * Split FMP's "nameAndPosition" into name and title.
 * FMP format: "Tim Cook Chief Executive Officer"
 * Strategy: find the first title keyword after 2+ name words.
 */
const TITLE_KEYWORDS = [
  'chief', 'president', 'officer', 'vice president', 'director',
  'executive', 'senior', 'general counsel', 'controller', 'treasurer',
  'secretary', 'chairman', 'ceo', 'cfo', 'coo', 'cto', 'cio',
  'svp', 'evp', 'managing', 'partner', 'former',
];

function splitNameAndTitle(namePos) {
  if (!namePos) return { name: '', title: '' };

  const lower = namePos.toLowerCase();

  // Try to find where the title starts
  let splitIdx = -1;
  for (const kw of TITLE_KEYWORDS) {
    const idx = lower.indexOf(kw);
    // Title keyword must appear after at least a first+last name (~5 chars minimum)
    if (idx > 4) {
      if (splitIdx === -1 || idx < splitIdx) {
        splitIdx = idx;
      }
    }
  }

  if (splitIdx > 0) {
    return {
      name: namePos.slice(0, splitIdx).trim(),
      title: namePos.slice(splitIdx).trim(),
    };
  }

  return { name: namePos.trim(), title: '' };
}
