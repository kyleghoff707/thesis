import { useState, useCallback } from 'react';
import { assembleDataPacket } from '../engines/dataExport';
import { fetchFilingMarkdownBatch } from '../engines/filingMarkdown';
import { extractAllSections } from '../engines/filingSections';

// ─── Config ─────────────────────────────────────────────────

const MAX_10K = 5;
const MAX_10Q = 4;
const SECTION_LIMIT_10K = 40_000;
const SECTION_LIMIT_10Q = 15_000;

// ─── Filing Selection ───────────────────────────────────────

/**
 * Pick the N most recent 10-Ks and 10-Qs, skipping XML filings.
 * Mirrors selectFilings() in api/src/assembly/assembleFilingContent.js.
 */
function selectFilings(filings) {
  if (!Array.isArray(filings) || filings.length === 0) return [];

  const tenKs = [];
  const tenQs = [];

  for (const f of filings) {
    if (f.primaryDocument?.endsWith('.xml')) continue;
    if (f.form === '10-K' && tenKs.length < MAX_10K) tenKs.push(f);
    else if (f.form === '10-Q' && tenQs.length < MAX_10Q) tenQs.push(f);
  }

  return [...tenKs, ...tenQs];
}

// ─── Section Truncation ─────────────────────────────────────

function truncateSections(sections, formType) {
  const limit = formType === '10-Q' ? SECTION_LIMIT_10Q : SECTION_LIMIT_10K;
  const result = {};
  for (const [key, text] of Object.entries(sections)) {
    result[key] = text.length > limit ? text.slice(0, limit) : text;
  }
  return result;
}

// ─── Hook ───────────────────────────────────────────────────

/**
 * Browser-side DataPacket + filing content assembly hook.
 *
 * Returns:
 *   assemble(ticker) — async function that assembles data + filing markdown
 *   phase — null | 'dataPacket' | 'filings' | 'done' | 'error'
 *   progress — { phase, detail, pct }
 *   error — error message string or null
 */
export function useAssembleData() {
  const [phase, setPhase] = useState(null);
  const [progress, setProgress] = useState({ phase: null, detail: '', pct: 0 });
  const [error, setError] = useState(null);

  const assemble = useCallback(async (ticker) => {
    setError(null);
    setPhase('dataPacket');
    setProgress({ phase: 'dataPacket', detail: 'Assembling financial data...', pct: 0 });

    // 1. Assemble DataPacket (financials, compensation, gurus, insiders, etc.)
    let dataPacket;
    try {
      dataPacket = await assembleDataPacket(ticker);
    } catch (err) {
      const msg = `DataPacket assembly failed: ${err.message}`;
      setError(msg);
      setPhase('error');
      setProgress({ phase: 'error', detail: msg, pct: 0 });
      throw new Error(msg);
    }

    setProgress({ phase: 'dataPacket', detail: 'Financial data assembled', pct: 30 });

    // 2. Select filings and add CIK
    const cik = dataPacket?.companyInfo?.cik;
    const selected = selectFilings(dataPacket?.filings);

    if (selected.length === 0 || !cik) {
      // No filings to process — return DataPacket only
      setPhase('done');
      setProgress({ phase: 'done', detail: 'Complete (no filings to process)', pct: 100 });
      return { dataPacket, filingContent: {}, assembledAt: new Date().toISOString() };
    }

    const filingsWithCik = selected.map(f => ({ ...f, cik }));

    // 3. Fetch filing markdown (sequential, rate-limited)
    setPhase('filings');
    setProgress({ phase: 'filings', detail: `Fetching 0/${filingsWithCik.length} filings...`, pct: 30 });

    let markdownMap;
    try {
      markdownMap = await fetchFilingMarkdownBatch(filingsWithCik, (completed, total) => {
        const filingPct = 30 + Math.round((completed / total) * 60);
        setProgress({
          phase: 'filings',
          detail: `Fetching ${completed}/${total} filings...`,
          pct: filingPct,
        });
      });
    } catch (err) {
      const msg = `Filing fetch failed: ${err.message}`;
      setError(msg);
      setPhase('error');
      setProgress({ phase: 'error', detail: msg, pct: 30 });
      throw new Error(msg);
    }

    // 4. Extract sections from each filing's markdown
    setProgress({ phase: 'filings', detail: 'Extracting sections...', pct: 92 });

    const filingContent = {};
    for (const filing of filingsWithCik) {
      const result = markdownMap.get(filing.accessionNumber);
      if (!result?.markdown) continue;

      const formType = filing.form === '10-Q' ? '10-Q' : '10-K';
      const sections = extractAllSections(result.markdown, formType);
      const truncated = truncateSections(sections, formType);

      // Key format matches Worker: "10-K-2025-01-31"
      const key = `${filing.form}-${filing.filingDate}`;
      filingContent[key] = {
        sections: truncated,
        charCount: result.charCount,
        fromCache: result.fromCache,
      };
    }

    setPhase('done');
    setProgress({ phase: 'done', detail: 'Assembly complete', pct: 100 });

    return { dataPacket, filingContent, assembledAt: new Date().toISOString() };
  }, []);

  // Lightweight variant for the one-pager — skips filing fetch + section extraction
  // since the one-pager slice drops the `filings` field. Keeps assembly fast
  // (~2-5s vs ~30-60s for the pitch-deck flow).
  const assembleOnePager = useCallback(async (ticker) => {
    setError(null);
    setPhase('dataPacket');
    setProgress({ phase: 'dataPacket', detail: 'Assembling financial data...', pct: 0 });

    let dataPacket;
    try {
      dataPacket = await assembleDataPacket(ticker);
    } catch (err) {
      const msg = `DataPacket assembly failed: ${err.message}`;
      setError(msg);
      setPhase('error');
      setProgress({ phase: 'error', detail: msg, pct: 0 });
      throw new Error(msg);
    }

    setPhase('done');
    setProgress({ phase: 'done', detail: 'Financial data assembled', pct: 100 });
    return { dataPacket, assembledAt: new Date().toISOString() };
  }, []);

  return { assemble, assembleOnePager, phase, progress, error };
}
