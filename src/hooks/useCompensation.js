// React hook for executive compensation data (DEF 14A proxy statements)
// Auto-fetches on ticker change. Independent of edgarStatements.

import { useState, useEffect, useRef } from 'react';
import { fetchCompensation } from '../engines/compensation';

export function useCompensation(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!ticker) {
      setData(null);
      setError(null);
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setError(null);

    fetchCompensation(ticker)
      .then(result => {
        if (cancelRef.current) return;
        setData(result);
      })
      .catch(err => {
        if (!cancelRef.current) setError(err.message);
      })
      .finally(() => {
        if (!cancelRef.current) setLoading(false);
      });

    return () => { cancelRef.current = true; };
  }, [ticker]);

  return { data, loading, error };
}
