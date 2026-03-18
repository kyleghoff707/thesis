import { useState, useEffect } from 'react';
import { fetchCompanyEvents, discoverIREventsUrl } from '../engines/companyEvents';

export function useCompanyEvents(ticker, website) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [irEventsUrl, setIrEventsUrl] = useState(null);

  // Fetch events (SEC + Yahoo) — depends only on ticker
  useEffect(() => {
    if (!ticker) {
      setEvents(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCompanyEvents(ticker)
      .then(result => { if (!cancelled) setEvents(result); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker]);

  // Discover IR events page — use EDGAR website or Yahoo website as fallback
  const effectiveWebsite = website || events?.yahooWebsite;

  useEffect(() => {
    if (!effectiveWebsite) return;

    let cancelled = false;

    discoverIREventsUrl(effectiveWebsite)
      .then(url => { if (!cancelled) setIrEventsUrl(url); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [effectiveWebsite]);

  return { events, loading, error, irEventsUrl };
}
