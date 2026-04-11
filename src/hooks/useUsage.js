// useUsage — fetches billing status and usage history from the API.
// Returns { billing, usage, loading, error, refresh }.

import { useState, useEffect, useCallback } from 'react';
import { userUrl } from '../engines/apiBase.js';

export function useUsage() {
  const [billing, setBilling] = useState(null);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [billingRes, usageRes] = await Promise.all([
        fetch(userUrl('/billing'), { credentials: 'include' }),
        fetch(userUrl('/usage'), { credentials: 'include' }),
      ]);
      if (!billingRes.ok) throw new Error('Failed to load billing data');
      if (!usageRes.ok) throw new Error('Failed to load usage data');
      const billingData = await billingRes.json();
      const usageData = await usageRes.json();
      setBilling(billingData);
      setUsage(usageData.usage || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { billing, usage, loading, error, refresh: fetchData };
}

export function useAdminBilling() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(userUrl('/billing?all=true'), { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load billing data');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { users, loading, error, refresh: fetchData };
}
