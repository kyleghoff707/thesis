import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { userUrl } from '../engines/apiBase';

const IS_DEV = import.meta.env.DEV;
const STORAGE_KEY = 'stock-analyzer-watchlists';

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal(watchlists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
}

async function saveToServer(watchlists) {
  // Map to server format: items[] → tickers[] (just ticker strings)
  const mapped = watchlists.map(w => ({
    id: w.id,
    name: w.name,
    tickers: (w.items || []).map(i => i.ticker),
  }));
  await fetch(userUrl('/watchlists'), {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlists: mapped }),
  });
}

export function useWatchlists() {
  const [watchlists, setWatchlists] = useState([]);

  // Load on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!IS_DEV) {
        try {
          const res = await fetch(userUrl('/watchlists'), { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data?.watchlists) {
              // Map server format back to client format: tickers[] → items[]
              const mapped = data.watchlists.map(w => ({
                id: w.id,
                name: w.name,
                createdAt: w.created_at,
                items: (w.tickers || []).map(t => typeof t === 'string' ? { ticker: t, companyName: '', addedAt: '' } : t),
              }));
              setWatchlists(mapped);
              return;
            }
          }
        } catch { /* fall through */ }
      }

      if (!cancelled) setWatchlists(loadLocal());
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function persist(next) {
    if (IS_DEV) {
      saveLocal(next);
    } else {
      saveToServer(next).catch(err => console.warn('Failed to save watchlists:', err.message));
    }
  }

  const createWatchlist = useCallback((name) => {
    const wl = {
      id: uuidv4(),
      name: name.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      items: [],
    };
    setWatchlists(prev => {
      const next = [wl, ...prev];
      persist(next);
      return next;
    });
    return wl;
  }, []);

  const deleteWatchlist = useCallback((id) => {
    setWatchlists(prev => {
      const next = prev.filter(w => w.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const renameWatchlist = useCallback((id, name) => {
    setWatchlists(prev => {
      const next = prev.map(w => w.id === id ? { ...w, name: name.trim() } : w);
      persist(next);
      return next;
    });
  }, []);

  const addTicker = useCallback((watchlistId, ticker, companyName = '') => {
    setWatchlists(prev => {
      const next = prev.map(w => {
        if (w.id !== watchlistId) return w;
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
      persist(next);
      return next;
    });
  }, []);

  const removeTicker = useCallback((watchlistId, ticker) => {
    setWatchlists(prev => {
      const next = prev.map(w => {
        if (w.id !== watchlistId) return w;
        return { ...w, items: w.items.filter(i => i.ticker !== ticker) };
      });
      persist(next);
      return next;
    });
  }, []);

  return { watchlists, createWatchlist, deleteWatchlist, renameWatchlist, addTicker, removeTicker };
}
