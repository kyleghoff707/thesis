import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { idbSet, idbDelete, idbGetAll } from '../engines/cacheStore';

const STORAGE_KEY = 'stock-analyzer-reports';  // Keep for migration
const IDB_STORE = 'reports';
const REPORT_TTL = 10 * 365 * 24 * 60 * 60 * 1000;  // 10 years (effectively permanent)

export function useResearch() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load reports from IndexedDB on mount, with localStorage migration
  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        // Try IndexedDB first
        const idbReports = await idbGetAll(IDB_STORE);

        if (!cancelled && idbReports.length > 0) {
          setReports(idbReports);
          setLoading(false);
          return;
        }

        // If IndexedDB is empty, check localStorage for migration
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Migrate each report to IndexedDB
            for (const report of parsed) {
              await idbSet(IDB_STORE, report.id, report, REPORT_TTL);
            }
            // Remove from localStorage after successful migration
            localStorage.removeItem(STORAGE_KEY);
            console.log(`Migrated ${parsed.length} reports from localStorage to IndexedDB`);

            if (!cancelled) {
              setReports(parsed);
              setLoading(false);
              return;
            }
          }
        }

        // No reports found anywhere
        if (!cancelled) {
          setReports([]);
          setLoading(false);
        }
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
      stageApprovals: {
        onePager: null,
        pitchDeck: null,
        fullStory: null,
      },
      onePager: {},
      pitchDeck: null,
      fullStory: null,
      notes: '',
      watchlist: false,
      competitors: { privateCompetitors: [] },
    };
    setReports(prev => [newReport, ...prev]);
    idbSet(IDB_STORE, newReport.id, newReport, REPORT_TTL).catch(err =>
      console.warn('Failed to save report to IndexedDB:', err.message)
    );
    return newReport;
  }, []);

  const updateReport = useCallback((id, updates) => {
    setReports(prev => {
      const next = prev.map(r =>
        r.id === id
          ? { ...r, ...updates, updatedAt: new Date().toISOString().slice(0, 10) }
          : r
      );
      // Fire-and-forget IndexedDB write for the updated report
      const updated = next.find(r => r.id === id);
      if (updated) {
        idbSet(IDB_STORE, id, updated, REPORT_TTL).catch(err =>
          console.warn('Failed to update report in IndexedDB:', err.message)
        );
      }
      return next;
    });
  }, []);

  const deleteReport = useCallback((id) => {
    setReports(prev => prev.filter(r => r.id !== id));
    idbDelete(IDB_STORE, id).catch(err =>
      console.warn('Failed to delete report from IndexedDB:', err.message)
    );
  }, []);

  const getReport = useCallback((id) => {
    return reports.find(r => r.id === id) || null;
  }, [reports]);

  return { reports, loading, createReport, updateReport, deleteReport, getReport };
}
