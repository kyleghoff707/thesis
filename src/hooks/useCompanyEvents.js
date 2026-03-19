import { useState, useEffect, useMemo } from 'react';
import { fetchCompanyEvents, discoverIREventsUrl, buildIRSearchUrl } from '../engines/companyEvents';

export function useCompanyEvents(ticker, website, companyName) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [irEventsUrl, setIrEventsUrl] = useState(null);

  // ── Reset ALL state when ticker changes ──────────────────────
  // Without this, switching from AMAT → META would show AMAT's
  // IR link until META's probe finishes.
  useEffect(() => {
    setEvents(null);
    setIrEventsUrl(null);
    setError(null);

    if (!ticker) return;

    let cancelled = false;
    setLoading(true);

    fetchCompanyEvents(ticker)
      .then(result => { if (!cancelled) setEvents(result); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker]);

  // ── Discover IR events page ──────────────────────────────────
  // Use EDGAR website first, fall back to Yahoo website from events fetch
  const effectiveWebsite = website || events?.yahooWebsite;

  useEffect(() => {
    if (!effectiveWebsite) return;

    let cancelled = false;

    discoverIREventsUrl(effectiveWebsite)
      .then(url => { if (!cancelled && url) setIrEventsUrl(url); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [effectiveWebsite]);

  // ── Instant fallback: Google search link ─────────────────────
  // Available immediately (no network needed). Always includes
  // ticker for robustness even if companyName is available.
  const irSearchUrl = useMemo(() => {
    if (!ticker) return null;
    const label = companyName
      ? `${companyName} (${ticker})`
      : ticker;
    return buildIRSearchUrl(label);
  }, [companyName, ticker]);

  // Two-phase: use real IR URL if found, otherwise Google search fallback
  const irLink = irEventsUrl || irSearchUrl;
  const irLinkIsDirect = !!irEventsUrl;

  return { events, loading, error, irLink, irLinkIsDirect };
}
