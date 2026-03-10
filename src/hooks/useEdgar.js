import { useState, useEffect } from 'react';
import { fetchEdgarFinancials } from '../engines/edgar';
import { fetchEdgarStatements, fetchEdgarQuarterly } from '../engines/edgarFinancials';

// Fetches all EDGAR data:
// 1. edgarData — supplementary fields (capEx, D&A, cash, dividends) for growth/score engines
// 2. edgarStatements — full financial statements (income/balance/cashFlow with ~100 fields)
// 3. edgarQuarterly — quarterly data (only fetched when view === 'quarterly')
//
// version: 'restated' (default) or 'original' — controls which EDGAR filing values are used
// view: 'annual' (default) or 'quarterly' — quarterly triggers additional fetch
export function useEdgar(ticker, version = 'restated', view = 'annual') {
  const [edgarData, setEdgarData] = useState(null);
  const [edgarStatements, setEdgarStatements] = useState(null);
  const [edgarQuarterly, setEdgarQuarterly] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetches = [
      fetchEdgarFinancials(ticker),
      fetchEdgarStatements(ticker, { version }),
    ];

    // Only fetch quarterly when user switches to quarterly view
    if (view === 'quarterly') {
      fetches.push(fetchEdgarQuarterly(ticker, { version }));
    }

    Promise.all(fetches)
      .then(([data, statements, quarterly]) => {
        if (!cancelled) {
          setEdgarData(data);
          setEdgarStatements(statements);
          if (quarterly !== undefined) setEdgarQuarterly(quarterly);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker, version, view]);

  return { edgarData, edgarStatements, edgarQuarterly, loading, error };
}
