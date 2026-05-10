import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { idbSet, idbDelete, idbGetAll } from '../engines/cacheStore';
import { userUrl } from '../engines/apiBase';

const IS_DEV = import.meta.env.DEV;
const STORAGE_KEY = 'stock-analyzer-reports';  // Keep for migration
const IDB_STORE = 'reports';
const REPORT_TTL = 10 * 365 * 24 * 60 * 60 * 1000;

// API helpers (production only)
async function apiFetch(path) {
  const res = await fetch(userUrl(path), { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(userUrl(path), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(userUrl(path), {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete(path) {
  await fetch(userUrl(path), { method: 'DELETE', credentials: 'include' });
}

export function useResearch() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load reports on mount
  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        if (!IS_DEV) {
          // Production: load from server
          const data = await apiFetch('/reports');
          if (!cancelled && data?.reports) {
            // Fetch full stage data for each report
            const fullReports = await Promise.all(
              data.reports.map(async (r) => {
                const full = await apiFetch(`/reports/${r.id}`);
                return full?.report || r;
              })
            );
            // Merge: preserve any optimistically-created reports not yet on server
            setReports(prev => {
              const serverIds = new Set(fullReports.map(r => r.id));
              const optimistic = prev.filter(r => !serverIds.has(r.id));
              return [...optimistic, ...fullReports];
            });
            setLoading(false);
            return;
          }
        }

        // Dev mode: IndexedDB with localStorage migration
        const idbReports = await idbGetAll(IDB_STORE);
        if (!cancelled && idbReports.length > 0) {
          setReports(idbReports);
          setLoading(false);
          return;
        }

        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const report of parsed) {
              await idbSet(IDB_STORE, report.id, report, REPORT_TTL);
            }
            localStorage.removeItem(STORAGE_KEY);
            if (!cancelled) { setReports(parsed); setLoading(false); return; }
          }
        }

        // Dev: auto-seed from .thesis reports if no data exists
        if (IS_DEV) {
          try {
            const res = await fetch('/seed-reports.json');
            if (res.ok) {
              const seed = await res.json();
              if (Array.isArray(seed) && seed.length > 0) {
                for (const report of seed) {
                  await idbSet(IDB_STORE, report.id, report, REPORT_TTL);
                }
                if (!cancelled) { setReports(seed); setLoading(false); return; }
              }
            }
          } catch { /* no seed file — that's fine */ }
        }

        if (!cancelled) { setReports([]); setLoading(false); }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load reports:', err.message);
          setError(err.message);
          setReports([]);
          setLoading(false);
        }
      }
    }

    loadReports();
    return () => { cancelled = true; };
  }, []);

  const createReport = useCallback((ticker, companyName = '') => {
    const now = new Date().toISOString().slice(0, 10);
    const newReport = {
      id: uuidv4(),
      ticker: ticker.toUpperCase(),
      companyName,
      createdAt: now,
      updatedAt: now,
      currentStage: 1,
      stageApprovals: { onePager: null, pitchDeck: null, fullStory: null },
      onePager: {},
      pitchDeck: null,
      fullStory: null,
      notes: '',
      watchlist: false,
      competitors: { privateCompetitors: [] },
    };
    setReports(prev => [newReport, ...prev]);

    if (IS_DEV) {
      idbSet(IDB_STORE, newReport.id, newReport, REPORT_TTL).catch(err =>
        console.warn('Failed to save report to IndexedDB:', err.message)
      );
    } else {
      // Production: don't persist to D1 on search — report stays in-memory only.
      // D1 row is created when pipeline generation starts (handleRun ensures it exists).
    }
    return newReport;
  }, []);

  const updateReport = useCallback((id, updates) => {
    setReports(prev => {
      const next = prev.map(r =>
        r.id === id
          ? { ...r, ...updates, updatedAt: new Date().toISOString().slice(0, 10) }
          : r
      );
      const updated = next.find(r => r.id === id);
      if (updated) {
        if (IS_DEV) {
          idbSet(IDB_STORE, id, updated, REPORT_TTL).catch(err =>
            console.warn('Failed to update report in IndexedDB:', err.message)
          );
        } else {
          // Separate stage data from metadata
          const stageKeys = ['onePager', 'pitchDeck', 'fullStory'];
          const stageUpdates = {};
          const metaUpdates = {};
          for (const [k, v] of Object.entries(updates)) {
            if (stageKeys.includes(k) && v) stageUpdates[k] = v;
            else metaUpdates[k] = v;
          }
          if (Object.keys(metaUpdates).length > 0) {
            apiPut(`/reports/${id}`, metaUpdates).catch(err =>
              console.warn('Failed to update report on server:', err.message)
            );
          }
          for (const [stage, data] of Object.entries(stageUpdates)) {
            apiPut(`/reports/${id}/stages/${stage}`, data).catch(err =>
              console.warn(`Failed to save ${stage} to server:`, err.message)
            );
          }
        }
      }
      return next;
    });
  }, []);

  const deleteReport = useCallback((id) => {
    setReports(prev => prev.filter(r => r.id !== id));
    if (IS_DEV) {
      idbDelete(IDB_STORE, id).catch(err =>
        console.warn('Failed to delete report from IndexedDB:', err.message)
      );
    } else {
      apiDelete(`/reports/${id}`).catch(err =>
        console.warn('Failed to delete report from server:', err.message)
      );
    }
  }, []);

  const getReport = useCallback((id) => {
    return reports.find(r => r.id === id) || null;
  }, [reports]);

  // Re-fetch a single report's full data (including stage data) and update local state.
  // Used after pipeline completion to pick up sections the Worker wrote to report_stages.
  const refreshReport = useCallback(async (id) => {
    if (IS_DEV) return;
    const full = await apiFetch(`/reports/${id}`);
    if (full?.report) {
      setReports(prev => prev.map(r => r.id === id ? full.report : r));
    }
  }, []);

  return { reports, loading, createReport, updateReport, deleteReport, getReport, refreshReport };
}
