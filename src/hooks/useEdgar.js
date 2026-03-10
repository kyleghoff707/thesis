import { useState, useEffect } from 'react';
import { fetchEdgarFinancials } from '../engines/edgar';
import { fetchEdgarStatements } from '../engines/edgarFinancials';

// Fetches all EDGAR data:
// 1. edgarData — supplementary fields (capEx, D&A, cash, dividends) for growth/score engines
// 2. edgarStatements — full financial statements (income/balance/cashFlow with ~100 fields)
//
// version: 'restated' (default) or 'original' — controls which EDGAR filing values are used
export function useEdgar(ticker, version = 'restated') {
  const [edgarData, setEdgarData] = useState(null);
  const [edgarStatements, setEdgarStatements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchEdgarFinancials(ticker),
      fetchEdgarStatements(ticker, { version }),
    ])
      .then(([data, statements]) => {
        if (!cancelled) {
          setEdgarData(data);
          setEdgarStatements(statements);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker, version]);

  return { edgarData, edgarStatements, loading, error };
}
