import { useState, useEffect } from 'react';
import { fetchCompanyDetails } from '../engines/companyDetails';

// Pure selector — given the hook's internal state and the currently-requested
// ticker, returns the public {company, loading, error} surface WITHOUT any
// stale company data from a prior ticker.
//
// Without this filter, the hook returns company=prev_ticker_data on the first
// render after a ticker change (React state persists until the next render
// applies the pending setState). Callers that react to `company` on that
// render would write the PREVIOUS ticker's company name into the NEW ticker's
// report — see the "Tractor Supply Co appeared on NKE report" regression.
export function selectCompanyForTicker(state, ticker) {
  const matches = state.fetchedTicker === ticker;
  return {
    company: matches ? state.company : null,
    loading: state.loading || !matches,
    error: state.error,
  };
}

export function useFinancials(ticker) {
  const [state, setState] = useState({
    company: null,
    loading: false,
    error: null,
    fetchedTicker: null,
  });

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    fetchCompanyDetails(ticker)
      .then(co => {
        if (!cancelled) setState({ company: co, loading: false, error: null, fetchedTicker: ticker });
      })
      .catch(err => {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: err.message }));
      });

    return () => { cancelled = true; };
  }, [ticker]);

  return selectCompanyForTicker(state, ticker);
}
