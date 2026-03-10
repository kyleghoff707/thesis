import { useState, useCallback, useEffect } from 'react';
import { applyTheme } from '../theme';

const STORAGE_KEY = 'stock-analyzer-theme';

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? false : saved === 'dark';
  });

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      applyTheme(next);
      return next;
    });
  }, []);

  return { isDark, toggleTheme };
}
