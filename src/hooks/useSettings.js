import { useState, useCallback, useEffect } from 'react';
import { userUrl } from '../engines/apiBase';

const IS_DEV = import.meta.env.DEV;
const STORAGE_KEY = 'stock-analyzer-settings';

export const DEFAULT_SETTINGS = {
  tourCompleted: false,
  defaultLayout: 'expanded',
  defaultVersion: 'restated',
  defaultView: 'annual',
  defaultPeriods: '10',
  defaultQtrPeriods: '8',
  growthChartYears: '10',
  defaultPriceRange: '5y',
  enableNport: true,
};

export function useSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });

  // Load settings on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!IS_DEV) {
        try {
          const res = await fetch(userUrl('/settings'), { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data?.settings) {
              setSettings(prev => ({ ...prev, ...data.settings }));
              return;
            }
          }
        } catch { /* fall through to localStorage */ }
      }

      // Dev or server unavailable: use localStorage
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!cancelled && saved) {
          setSettings(prev => ({ ...prev, ...JSON.parse(saved) }));
        }
      } catch { /* use defaults */ }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };

      if (IS_DEV) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        fetch(userUrl('/settings'), {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(err => console.warn('Failed to save settings to server:', err.message));
      }

      return next;
    });
  }, []);

  return { settings, updateSettings };
}
