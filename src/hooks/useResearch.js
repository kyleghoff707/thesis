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

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
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
