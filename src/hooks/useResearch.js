import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'stock-analyzer-reports';

function loadReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function evictCaches() {
  // Safety net: remove any remaining small sa-cache: entries from localStorage.
  // Most large caches (EDGAR facts, guru data, N-PORT) now live in IndexedDB.
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('sa-cache:') || k.startsWith('guru-'))) {
      toRemove.push(k);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

function saveReports(reports) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Evict caches and retry — user data is more important than caches
      evictCaches();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
      } catch {
        console.warn('localStorage still full after eviction — reports saved in memory only');
      }
    }
  }
}

export function useResearch() {
  const [reports, setReports] = useState(loadReports);

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
    setReports(prev => {
      const next = [newReport, ...prev];
      saveReports(next);
      return next;
    });
    return newReport;
  }, []);

  const updateReport = useCallback((id, updates) => {
    setReports(prev => {
      const next = prev.map(r =>
        r.id === id
          ? { ...r, ...updates, updatedAt: new Date().toISOString().slice(0, 10) }
          : r
      );
      saveReports(next);
      return next;
    });
  }, []);

  const deleteReport = useCallback((id) => {
    setReports(prev => {
      const next = prev.filter(r => r.id !== id);
      saveReports(next);
      return next;
    });
  }, []);

  const getReport = useCallback((id) => {
    return reports.find(r => r.id === id) || null;
  }, [reports]);

  return { reports, createReport, updateReport, deleteReport, getReport };
}
