// Generation State Persistence
// Manages .thes1s/reports/{TICKER}/progress.json for crash recovery and progress tracking
// Used by orchestrator to persist generation state across process restarts

import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { ProgressSchema, createInitialProgress } from '../schemas/progress.js';

const THES1S_DIR = join(process.cwd(), '.thes1s');
const REPORTS_DIR = join(THES1S_DIR, 'reports');

// Section keys per stage — matches dispatch-table.json sectionKeys
const SECTION_KEYS = {
  onePager: ['company_info', 'minimum_standards', 'meaning', 'growth_metrics', 'valuation_summary', 'overall_verdict'],
  pitchDeck: ['radar', 'simple_predictable', 'market_position', 'barriers_moats', 'fcf', 'management', 'roe_roic_debt', 'balance_sheet', 'pest', 'valuation'],
  fullStory: ['event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist', 'valuation_confirmation', 'inversion_rebuttal'],
};

// Valid state machine transitions
const VALID_TRANSITIONS = {
  IDLE: ['DATA_ASSEMBLY'],
  DATA_ASSEMBLY: ['PRIMARY_SOURCE_READING', 'WAVE_1_RUNNING'],
  PRIMARY_SOURCE_READING: ['WAVE_1_RUNNING'],
  WAVE_1_RUNNING: ['CHECKPOINT_1', 'WAVE_2_RUNNING'],
  CHECKPOINT_1: ['WAVE_2_RUNNING'],
  WAVE_2_RUNNING: ['CHECKPOINT_2', 'WAVE_3_RUNNING'],
  CHECKPOINT_2: ['WAVE_3_RUNNING'],
  WAVE_3_RUNNING: ['CHECKPOINT_3', 'SYNTHESIS'],
  CHECKPOINT_3: ['SYNTHESIS'],
  SYNTHESIS: ['QUALITY_CHECK'],
  QUALITY_CHECK: ['COMPLETE'],
  COMPLETE: [],
};

// Returns the path to progress.json for a ticker
function getProgressPath(ticker) {
  return join(REPORTS_DIR, ticker.toUpperCase(), 'progress.json');
}

// Returns the path to the sections directory for a ticker
function getSectionsDir(ticker) {
  return join(REPORTS_DIR, ticker.toUpperCase(), 'sections');
}

// Create a new progress object for a ticker + stage, write to disk, return it
export function createProgress(ticker, stage) {
  if (!SECTION_KEYS[stage]) {
    throw new Error(`Invalid stage: ${stage}. Must be one of: ${Object.keys(SECTION_KEYS).join(', ')}`);
  }
  const progress = createInitialProgress(ticker, stage, SECTION_KEYS[stage]);
  const progressPath = getProgressPath(ticker);
  mkdirSync(dirname(progressPath), { recursive: true });
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  return progress;
}

// Read progress from disk for a ticker, return null if not found
export function readProgress(ticker) {
  const progressPath = getProgressPath(ticker);
  if (!existsSync(progressPath)) {
    return null;
  }
  try {
    const raw = readFileSync(progressPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = ProgressSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(`Progress validation failed for ${ticker}:`, result.error);
      return null;
    }
    return result.data;
  } catch (err) {
    console.warn(`Failed to read progress for ${ticker}:`, err.message);
    return null;
  }
}

// Write a progress object to disk (validates first)
export function writeProgress(ticker, progress) {
  const result = ProgressSchema.safeParse(progress);
  if (!result.success) {
    throw new Error(`Invalid progress object: ${JSON.stringify(result.error.issues || result.error)}`);
  }
  const progressPath = getProgressPath(ticker);
  mkdirSync(dirname(progressPath), { recursive: true });
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

// Update a section's status (and optional metadata), persist to disk
export function updateSectionStatus(ticker, sectionKey, status, metadata = {}) {
  const progress = readProgress(ticker);
  if (!progress) {
    throw new Error(`No progress found for ticker: ${ticker}`);
  }
  if (!progress.sections[sectionKey]) {
    throw new Error(`Section key not found: ${sectionKey}`);
  }
  progress.sections[sectionKey] = { status, ...metadata };
  progress.lastUpdated = new Date().toISOString();
  writeProgress(ticker, progress);
  return progress;
}

// Advance the state machine — validates the transition
export function advanceState(ticker, newState) {
  const progress = readProgress(ticker);
  if (!progress) {
    throw new Error(`No progress found for ticker: ${ticker}`);
  }
  const currentState = progress.state;
  const validNext = VALID_TRANSITIONS[currentState];
  if (!validNext || !validNext.includes(newState)) {
    throw new Error(`Invalid state transition: ${currentState} -> ${newState}`);
  }
  progress.state = newState;
  progress.lastUpdated = new Date().toISOString();
  writeProgress(ticker, progress);

  // Also update generation-status.json for UI polling
  try {
    updateGenerationStatus(ticker, { state: newState });
  } catch { /* non-critical */ }

  return progress;
}

// Delete the progress file (section outputs are preserved)
export function deleteProgress(ticker) {
  const progressPath = getProgressPath(ticker);
  if (existsSync(progressPath)) {
    unlinkSync(progressPath);
  }
}

// Save a completed section's output to .thes1s/reports/{TICKER}/sections/{sectionKey}.json
export function saveSectionOutput(ticker, sectionKey, sectionData) {
  const sectionsDir = getSectionsDir(ticker);
  mkdirSync(sectionsDir, { recursive: true });
  const filePath = join(sectionsDir, `${sectionKey}.json`);
  writeFileSync(filePath, JSON.stringify(sectionData, null, 2));
}

// Read a section's output from disk, return null if not found
export function readSectionOutput(ticker, sectionKey) {
  const sectionsDir = getSectionsDir(ticker);
  const filePath = join(sectionsDir, `${sectionKey}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to read section output ${sectionKey} for ${ticker}:`, err.message);
    return null;
  }
}

// Returns the path to the quality directory for a ticker
function getQualityDir(ticker) {
  return join(REPORTS_DIR, ticker.toUpperCase(), 'quality');
}

// Returns the path to the reports directory for a ticker
function getTickerDir(ticker) {
  return join(REPORTS_DIR, ticker.toUpperCase());
}

// Save a quality report to .thes1s/reports/{TICKER}/quality/one-pager.quality.json
export function saveQualityReport(ticker, qualityData) {
  const qualityDir = getQualityDir(ticker);
  mkdirSync(qualityDir, { recursive: true });
  const filePath = join(qualityDir, 'one-pager.quality.json');
  writeFileSync(filePath, JSON.stringify(qualityData, null, 2));
}

// Save a budget report to .thes1s/reports/{TICKER}/budget.json
export function saveBudgetReport(ticker, budgetData) {
  const tickerDir = getTickerDir(ticker);
  mkdirSync(tickerDir, { recursive: true });
  const filePath = join(tickerDir, 'budget.json');
  writeFileSync(filePath, JSON.stringify(budgetData, null, 2));
}

// Read a quality report from disk, return null if not found
export function readQualityReport(ticker) {
  const qualityDir = getQualityDir(ticker);
  const filePath = join(qualityDir, 'one-pager.quality.json');
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to read quality report for ${ticker}:`, err.message);
    return null;
  }
}

// --- generation-status.json writer ---
// Per D-07-a, D-07-c, D-07-d: PM progress visibility via a pollable status file
// Written at every state transition so the UI component can show real-time progress

// Section-to-agent mapping for status display
const SECTION_AGENT_MAP = {
  radar: 'business-analyst',
  simple_predictable: 'business-analyst',
  market_position: 'competitor-evaluator',
  barriers_moats: 'competitor-evaluator',
  fcf: 'financial-analyst',
  management: 'management-evaluator',
  roe_roic_debt: 'financial-analyst',
  balance_sheet: 'financial-analyst',
  pest: 'risk-analyst',
  valuation: 'valuation-specialist',
};

// Pitch Deck dispatch phases for status tracking
const DISPATCH_PHASES = [
  { phase: 1, sections: ['radar', 'simple_predictable', 'market_position'] },
  { phase: 2, sections: ['barriers_moats', 'fcf', 'management', 'roe_roic_debt', 'balance_sheet'] },
  { phase: 3, sections: ['pest', 'valuation'] },
];

// Returns the path to generation-status.json for a ticker
function getStatusPath(ticker) {
  return join(REPORTS_DIR, ticker.toUpperCase(), 'generation-status.json');
}

// Initialize generation-status.json with all sections as pending
export function initGenerationStatus(ticker, stage) {
  const keys = SECTION_KEYS[stage] || [];
  const now = new Date().toISOString();
  const sections = {};
  for (const key of keys) {
    sections[key] = { status: 'pending' };
  }
  const phases = DISPATCH_PHASES.map(p => ({
    phase: p.phase,
    status: 'pending',
  }));
  const status = {
    ticker: ticker.toUpperCase(),
    stage,
    state: 'IDLE',
    startedAt: now,
    lastUpdated: now,
    elapsedMs: 0,
    sections,
    phases,
    currentAgent: null,
    completedCount: 0,
    totalSections: keys.length,
  };
  const statusPath = getStatusPath(ticker);
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify(status, null, 2));
  return status;
}

// Read, deep-merge updates, recompute derived fields, write back
export function updateGenerationStatus(ticker, updates) {
  const statusPath = getStatusPath(ticker);
  let status;
  try {
    const raw = readFileSync(statusPath, 'utf-8');
    status = JSON.parse(raw);
  } catch {
    // If no status file exists, initialize one (fallback)
    status = initGenerationStatus(ticker, 'pitchDeck');
  }

  // Deep-merge sections if provided
  if (updates.sections) {
    for (const [key, val] of Object.entries(updates.sections)) {
      status.sections[key] = { ...status.sections[key], ...val };
    }
    delete updates.sections;
  }

  // Deep-merge phases if provided
  if (updates.phases) {
    for (const phaseUpdate of updates.phases) {
      const idx = status.phases.findIndex(p => p.phase === phaseUpdate.phase);
      if (idx >= 0) {
        status.phases[idx] = { ...status.phases[idx], ...phaseUpdate };
      }
    }
    delete updates.phases;
  }

  // Apply remaining top-level updates
  Object.assign(status, updates);

  // Recompute derived fields
  status.lastUpdated = new Date().toISOString();
  if (status.startedAt) {
    status.elapsedMs = Date.now() - new Date(status.startedAt).getTime();
  }
  status.completedCount = Object.values(status.sections)
    .filter(s => s.status === 'complete').length;

  writeFileSync(statusPath, JSON.stringify(status, null, 2));
  return status;
}

// Mark a section as running with agent info
export function startSection(ticker, sectionKey, agent) {
  const now = new Date().toISOString();
  return updateGenerationStatus(ticker, {
    sections: { [sectionKey]: { status: 'running', startedAt: now, agent: agent || SECTION_AGENT_MAP[sectionKey] || null } },
    currentAgent: agent || SECTION_AGENT_MAP[sectionKey] || null,
  });
}

// Mark a section as complete with computed duration
export function completeSection(ticker, sectionKey) {
  const statusPath = getStatusPath(ticker);
  let section = {};
  try {
    const raw = readFileSync(statusPath, 'utf-8');
    const status = JSON.parse(raw);
    section = status.sections[sectionKey] || {};
  } catch { /* non-critical */ }

  const now = new Date().toISOString();
  const durationMs = section.startedAt
    ? Date.now() - new Date(section.startedAt).getTime()
    : 0;

  return updateGenerationStatus(ticker, {
    sections: { [sectionKey]: { status: 'complete', completedAt: now, durationMs } },
  });
}

// Update a dispatch phase's status and timestamps
export function updatePhaseStatus(ticker, phaseNum, phaseStatus) {
  const now = new Date().toISOString();
  const phaseUpdate = { phase: phaseNum, status: phaseStatus };
  if (phaseStatus === 'active' || phaseStatus === 'running') {
    phaseUpdate.startedAt = now;
  }
  if (phaseStatus === 'complete') {
    phaseUpdate.completedAt = now;
  }
  return updateGenerationStatus(ticker, {
    phases: [phaseUpdate],
  });
}

// Export constants for testing
export const _testExports = {
  SECTION_KEYS, VALID_TRANSITIONS, getProgressPath, getSectionsDir, getQualityDir, getTickerDir,
  getStatusPath, SECTION_AGENT_MAP, DISPATCH_PHASES,
};
