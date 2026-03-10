import { useState, useEffect } from 'react';
import { fetchCompanyDetails } from '../engines/companyDetails';

export function useFinancials(ticker) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCompanyDetails(ticker)
      .then(co => {
        if (!cancelled) setCompany(co);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker]);

  return { company, loading, error };
}
