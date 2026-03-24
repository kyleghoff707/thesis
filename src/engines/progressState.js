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
  fullStory: ['event_analysis', 'meaning_checklist', 'moat_checklist', 'management_checklist', 'valuation_confirmation', 'inversion_rebuttal', 'trading_strategy', 'pace_plan'],
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

// Export constants for testing
export const _testExports = { SECTION_KEYS, VALID_TRANSITIONS, getProgressPath, getSectionsDir };
