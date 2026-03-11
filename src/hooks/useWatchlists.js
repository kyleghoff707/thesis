import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'stock-analyzer-watchlists';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(watchlists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
}

export function useWatchlists() {
  const [watchlists, setWatchlists] = useState(load);

  const createWatchlist = useCallback((name) => {
    const wl = {
      id: uuidv4(),
      name: name.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      items: [],
    };
    setWatchlists(prev => {
      const next = [wl, ...prev];
      save(next);
      return next;
    });
    return wl;
  }, []);

  const deleteWatchlist = useCallback((id) => {
    setWatchlists(prev => {
      const next = prev.filter(w => w.id !== id);
      save(next);
      return next;
    });
  }, []);

  const renameWatchlist = useCallback((id, name) => {
    setWatchlists(prev => {
      const next = prev.map(w => w.id === id ? { ...w, name: name.trim() } : w);
      save(next);
      return next;
    });
  }, []);

  const addTicker = useCallback((watchlistId, ticker, companyName = '') => {
    setWatchlists(prev => {
      const next = prev.map(w => {
        if (w.id !== watchlistId) return w;
        // Don't add duplicates
        if (w.items.some(i => i.ticker === ticker.toUpperCase())) return w;
        return {
          ...w,
          items: [...w.items, {
            ticker: ticker.toUpperCase(),
            companyName,
            addedAt: new Date().toISOString().slice(0, 10),
          }],
        };
      });
      save(next);
      return next;
    });
  }, []);

  const removeTicker = useCallback((watchlistId, ticker) => {
    setWatchlists(prev => {
      const next = prev.map(w => {
        if (w.id !== watchlistId) return w;
        return { ...w, items: w.items.filter(i => i.ticker !== ticker) };
      });
      save(next);
      return next;
    });
  }, []);

  return { watchlists, createWatchlist, deleteWatchlist, renameWatchlist, addTicker, removeTicker };
}
