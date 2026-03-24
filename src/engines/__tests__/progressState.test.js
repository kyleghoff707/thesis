// Generation State Persistence — Tests
// Validates CRUD operations on .thes1s/reports/{TICKER}/progress.json
// Uses a __TEST_PS__ ticker to avoid polluting real data

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

import {
  createProgress,
  readProgress,
  writeProgress,
  updateSectionStatus,
  advanceState,
  deleteProgress,
  saveSectionOutput,
  readSectionOutput,
} from '../progressState.js';

const TEST_TICKER = '__TEST_PS__';
const THES1S_DIR = join(process.cwd(), '.thes1s');
const TEST_DIR = join(THES1S_DIR, 'reports', TEST_TICKER);

afterAll(() => {
  // Clean up test artifacts
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

describe('progressState', () => {
  describe('createProgress', () => {
    it('should create a progress object with state IDLE', () => {
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      expect(progress).toBeDefined();
      expect(progress.ticker).toBe(TEST_TICKER);
      expect(progress.stage).toBe('pitchDeck');
      expect(progress.state).toBe('IDLE');
    });

    it('should include all 10 pitchDeck section keys as pending', () => {
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      const sectionKeys = Object.keys(progress.sections);
      expect(sectionKeys.length).toBe(10);
      expect(sectionKeys).toContain('radar');
      expect(sectionKeys).toContain('valuation');
      for (const key of sectionKeys) {
        expect(progress.sections[key].status).toBe('pending');
      }
    });

    it('should include all 6 onePager section keys', () => {
      const progress = createProgress(TEST_TICKER, 'onePager');
      const sectionKeys = Object.keys(progress.sections);
      expect(sectionKeys.length).toBe(6);
      expect(sectionKeys).toContain('company_info');
      expect(sectionKeys).toContain('overall_verdict');
    });

    it('should include all 8 fullStory section keys', () => {
      const progress = createProgress(TEST_TICKER, 'fullStory');
      const sectionKeys = Object.keys(progress.sections);
      expect(sectionKeys.length).toBe(8);
      expect(sectionKeys).toContain('event_analysis');
      expect(sectionKeys).toContain('pace_plan');
    });
  });

  describe('writeProgress + readProgress (round-trip)', () => {
    it('should write progress JSON to .thes1s/reports/{TICKER}/progress.json', () => {
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      writeProgress(TEST_TICKER, progress);
      const progressPath = join(TEST_DIR, 'progress.json');
      expect(existsSync(progressPath)).toBe(true);
    });

    it('should read back the exact same object that was written', () => {
      const written = createProgress(TEST_TICKER, 'pitchDeck');
      writeProgress(TEST_TICKER, written);
      const readBack = readProgress(TEST_TICKER);
      expect(readBack).toEqual(written);
    });
  });

  describe('readProgress edge cases', () => {
    it('should return null for non-existent ticker', () => {
      const result = readProgress('NONEXISTENT_TICKER_XYZ');
      expect(result).toBeNull();
    });
  });

  describe('updateSectionStatus', () => {
    beforeAll(() => {
      // Reset with fresh progress
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      writeProgress(TEST_TICKER, progress);
    });

    it('should change section status from pending to running', () => {
      const updated = updateSectionStatus(TEST_TICKER, 'radar', 'running');
      expect(updated.sections.radar.status).toBe('running');
    });

    it('should change section status to complete with metadata', () => {
      const updated = updateSectionStatus(TEST_TICKER, 'radar', 'complete', {
        agentRole: 'business-analyst',
        tokenCost: { input: 5000, output: 1200 },
      });
      expect(updated.sections.radar.status).toBe('complete');
      expect(updated.sections.radar.agentRole).toBe('business-analyst');
      expect(updated.sections.radar.tokenCost.input).toBe(5000);
      expect(updated.sections.radar.tokenCost.output).toBe(1200);
    });

    it('should persist the updated status to disk', () => {
      updateSectionStatus(TEST_TICKER, 'simple_predictable', 'running');
      const readBack = readProgress(TEST_TICKER);
      expect(readBack.sections.simple_predictable.status).toBe('running');
    });
  });

  describe('advanceState', () => {
    beforeAll(() => {
      // Reset with fresh progress
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      writeProgress(TEST_TICKER, progress);
    });

    it('should advance from IDLE to DATA_ASSEMBLY', () => {
      const updated = advanceState(TEST_TICKER, 'DATA_ASSEMBLY');
      expect(updated.state).toBe('DATA_ASSEMBLY');
    });

    it('should reject invalid transition (DATA_ASSEMBLY -> WAVE_2_RUNNING)', () => {
      expect(() => {
        advanceState(TEST_TICKER, 'WAVE_2_RUNNING');
      }).toThrow('Invalid state transition');
    });

    it('should reject invalid transition from IDLE to WAVE_2_RUNNING', () => {
      // Reset to IDLE
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      writeProgress(TEST_TICKER, progress);
      expect(() => {
        advanceState(TEST_TICKER, 'WAVE_2_RUNNING');
      }).toThrow('Invalid state transition');
    });
  });

  describe('deleteProgress', () => {
    it('should remove the progress file', () => {
      // Ensure progress exists first
      const progress = createProgress(TEST_TICKER, 'pitchDeck');
      writeProgress(TEST_TICKER, progress);
      expect(readProgress(TEST_TICKER)).not.toBeNull();

      deleteProgress(TEST_TICKER);
      expect(readProgress(TEST_TICKER)).toBeNull();
    });
  });

  describe('saveSectionOutput + readSectionOutput', () => {
    it('should write section data to sections directory', () => {
      const sectionData = { key: 'radar', title: 'Radar', content: 'Test content', citations: [] };
      saveSectionOutput(TEST_TICKER, 'radar', sectionData);
      const sectionsDir = join(TEST_DIR, 'sections');
      expect(existsSync(join(sectionsDir, 'radar.json'))).toBe(true);
    });

    it('should read back the same section data', () => {
      const sectionData = { key: 'radar', title: 'Radar', content: 'Test content', citations: [] };
      saveSectionOutput(TEST_TICKER, 'radar', sectionData);
      const readBack = readSectionOutput(TEST_TICKER, 'radar');
      expect(readBack).toEqual(sectionData);
    });

    it('should return null for non-existent section', () => {
      const result = readSectionOutput(TEST_TICKER, 'nonexistent_section');
      expect(result).toBeNull();
    });
  });
});
