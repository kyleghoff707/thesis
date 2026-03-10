import { useState, useEffect } from 'react';
import { fetchPrices, latestPrice } from '../engines/prices';

export function usePrices(ticker, range = '5y') {
  const [prices, setPrices] = useState(null);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPrices(ticker, range)
      .then(data => {
        if (!cancelled) {
          setPrices(data);
          setLatest(latestPrice(data));
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker, range]);

  return { prices, latest, loading, error };
}
