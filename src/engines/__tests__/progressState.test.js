// Generation State Persistence — Tests
// Validates CRUD operations on .thesis/reports/{TICKER}/progress.json
// Uses a __TEST_PS__ ticker to avoid polluting real data

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs';
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
  initGenerationStatus,
  updateGenerationStatus,
  startSection,
  completeSection,
  updatePhaseStatus,
} from '../progressState.js';

const TEST_TICKER = '__TEST_PS__';
const THESIS_DIR = join(process.cwd(), '.thesis');
const TEST_DIR = join(THESIS_DIR, 'reports', TEST_TICKER);

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

    it('should include all 6 finalThesis section keys', () => {
      const progress = createProgress(TEST_TICKER, 'finalThesis');
      const sectionKeys = Object.keys(progress.sections);
      expect(sectionKeys.length).toBe(6);
      expect(sectionKeys).toContain('event_analysis');
      expect(sectionKeys).toContain('meaning_checklist');
      expect(sectionKeys).toContain('moat_checklist');
      expect(sectionKeys).toContain('management_checklist');
      expect(sectionKeys).toContain('valuation_confirmation');
      expect(sectionKeys).toContain('inversion_rebuttal');
      expect(sectionKeys).not.toContain('trading_strategy');
      expect(sectionKeys).not.toContain('pace_plan');
    });
  });

  describe('writeProgress + readProgress (round-trip)', () => {
    it('should write progress JSON to .thesis/reports/{TICKER}/progress.json', () => {
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

  describe('generation-status.json', () => {
    describe('initGenerationStatus', () => {
      it('should create generation-status.json with all 10 pitchDeck sections as pending', () => {
        const status = initGenerationStatus(TEST_TICKER, 'pitchDeck');
        expect(status.ticker).toBe(TEST_TICKER);
        expect(status.stage).toBe('pitchDeck');
        expect(status.state).toBe('IDLE');
        expect(status.totalSections).toBe(10);
        expect(status.completedCount).toBe(0);
        expect(status.currentAgent).toBeNull();
        expect(Object.keys(status.sections).length).toBe(10);
        for (const key of Object.keys(status.sections)) {
          expect(status.sections[key].status).toBe('pending');
        }
      });

      it('should write the file to disk', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const statusPath = join(TEST_DIR, 'generation-status.json');
        expect(existsSync(statusPath)).toBe(true);
      });

      it('should include 3 dispatch phases', () => {
        const status = initGenerationStatus(TEST_TICKER, 'pitchDeck');
        expect(status.phases.length).toBe(3);
        expect(status.phases[0].phase).toBe(1);
        expect(status.phases[0].status).toBe('pending');
        expect(status.phases[2].phase).toBe(3);
      });

      it('should set startedAt and lastUpdated timestamps', () => {
        const before = new Date().toISOString();
        const status = initGenerationStatus(TEST_TICKER, 'pitchDeck');
        expect(status.startedAt).toBeDefined();
        expect(status.lastUpdated).toBeDefined();
        expect(new Date(status.startedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 100);
      });
    });

    describe('updateGenerationStatus', () => {
      it('should deep-merge section updates', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = updateGenerationStatus(TEST_TICKER, {
          sections: { radar: { status: 'running', startedAt: '2026-03-25T10:00:00Z' } },
        });
        expect(updated.sections.radar.status).toBe('running');
        expect(updated.sections.radar.startedAt).toBe('2026-03-25T10:00:00Z');
        // Other sections remain pending
        expect(updated.sections.simple_predictable.status).toBe('pending');
      });

      it('should update top-level fields', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = updateGenerationStatus(TEST_TICKER, {
          state: 'WAVE_1_RUNNING',
          currentAgent: 'business-analyst',
        });
        expect(updated.state).toBe('WAVE_1_RUNNING');
        expect(updated.currentAgent).toBe('business-analyst');
      });

      it('should recompute completedCount', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        updateGenerationStatus(TEST_TICKER, {
          sections: { radar: { status: 'complete' } },
        });
        const updated = updateGenerationStatus(TEST_TICKER, {
          sections: { simple_predictable: { status: 'complete' } },
        });
        expect(updated.completedCount).toBe(2);
      });

      it('should compute elapsedMs from startedAt', () => {
        const status = initGenerationStatus(TEST_TICKER, 'pitchDeck');
        // Small delay to ensure elapsed > 0
        const updated = updateGenerationStatus(TEST_TICKER, { state: 'DATA_ASSEMBLY' });
        expect(updated.elapsedMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('startSection', () => {
      it('should mark a section as running with agent and startedAt', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = startSection(TEST_TICKER, 'radar', 'business-analyst');
        expect(updated.sections.radar.status).toBe('running');
        expect(updated.sections.radar.agent).toBe('business-analyst');
        expect(updated.sections.radar.startedAt).toBeDefined();
        expect(updated.currentAgent).toBe('business-analyst');
      });

      it('should use default agent from SECTION_AGENT_MAP if none provided', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = startSection(TEST_TICKER, 'pest');
        expect(updated.sections.pest.agent).toBe('risk-analyst');
      });
    });

    describe('completeSection', () => {
      it('should mark a section as complete with durationMs', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        startSection(TEST_TICKER, 'radar', 'business-analyst');
        const updated = completeSection(TEST_TICKER, 'radar');
        expect(updated.sections.radar.status).toBe('complete');
        expect(updated.sections.radar.completedAt).toBeDefined();
        expect(updated.sections.radar.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should increment completedCount', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        startSection(TEST_TICKER, 'radar', 'business-analyst');
        const updated = completeSection(TEST_TICKER, 'radar');
        expect(updated.completedCount).toBe(1);
      });
    });

    describe('updatePhaseStatus', () => {
      it('should update phase status to active with startedAt', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = updatePhaseStatus(TEST_TICKER, 1, 'active');
        expect(updated.phases[0].status).toBe('active');
        expect(updated.phases[0].startedAt).toBeDefined();
      });

      it('should update phase status to complete with completedAt', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = updatePhaseStatus(TEST_TICKER, 1, 'complete');
        expect(updated.phases[0].status).toBe('complete');
        expect(updated.phases[0].completedAt).toBeDefined();
      });

      it('should only update the specified phase', () => {
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        const updated = updatePhaseStatus(TEST_TICKER, 2, 'active');
        expect(updated.phases[0].status).toBe('pending');
        expect(updated.phases[1].status).toBe('active');
        expect(updated.phases[2].status).toBe('pending');
      });
    });

    describe('advanceState wires generation-status.json', () => {
      it('should update generation-status.json state when advanceState is called', () => {
        createProgress(TEST_TICKER, 'pitchDeck');
        initGenerationStatus(TEST_TICKER, 'pitchDeck');
        advanceState(TEST_TICKER, 'DATA_ASSEMBLY');

        const statusPath = join(TEST_DIR, 'generation-status.json');
        const raw = readFileSync(statusPath, 'utf-8');
        const status = JSON.parse(raw);
        expect(status.state).toBe('DATA_ASSEMBLY');
      });
    });
  });
});
