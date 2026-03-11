import { useState, useCallback } from 'react';

const STORAGE_KEY = 'stock-analyzer-settings';

export const DEFAULT_SETTINGS = {
  // Financial Statements
  defaultLayout: 'expanded',
  defaultVersion: 'restated',
  defaultView: 'annual',
  defaultPeriods: '10',
  defaultQtrPeriods: '8',
  // Growth Analysis
  growthChartYears: '10', // '5' | '10' | '13' | 'all'
  // Price Chart
  defaultPriceRange: '5y',
  // Gurus
  enableNport: true, // Fetch N-PORT data (cash/money market positions) for gurus with registered funds
};

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  });

  const updateSettings = useCallback((updates) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
