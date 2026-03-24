// Agent Definitions — validates all agent directories have required config files
// Tests that all 10 agent roles are defined with valid config.json

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = join(process.cwd(), 'agents');

// All 10 agent roles (9 from Plan 04 + orchestrator from Plan 05)
const EXPECTED_AGENTS = [
  'data-assembler',
  'primary-source-reader',
  'financial-analyst',
  'business-analyst',
  'competitor-evaluator',
  'management-evaluator',
  'risk-analyst',
  'valuation-specialist',
  'synthesis-writer',
  'orchestrator',
];

// AI agents have model and prompt; code-driven agents (data-assembler, orchestrator) do not
const AI_AGENTS = EXPECTED_AGENTS.filter(a => a !== 'data-assembler' && a !== 'orchestrator');

describe('Agent Definitions', () => {
  it('should have exactly 10 agent directories', () => {
    const existing = EXPECTED_AGENTS.filter(a => existsSync(join(AGENTS_DIR, a)));
    expect(existing.length).toBe(10);
  });

  for (const agent of EXPECTED_AGENTS) {
    describe(agent, () => {
      const agentDir = join(AGENTS_DIR, agent);

      it('should have a config.json', () => {
        const configPath = join(agentDir, 'config.json');
        expect(existsSync(configPath)).toBe(true);
      });

      it('should have valid JSON in config.json', () => {
        const configPath = join(agentDir, 'config.json');
        const raw = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);
        expect(config.role).toBe(agent);
      });

      it('should have a README.md', () => {
        const readmePath = join(agentDir, 'README.md');
        expect(existsSync(readmePath)).toBe(true);
      });
    });
  }

  for (const agent of AI_AGENTS) {
    describe(`${agent} (AI agent)`, () => {
      it('should have a model specified', () => {
        const config = JSON.parse(readFileSync(join(AGENTS_DIR, agent, 'config.json'), 'utf-8'));
        expect(config.model).toBeTruthy();
      });

      it('should have curriculum entries', () => {
        const config = JSON.parse(readFileSync(join(AGENTS_DIR, agent, 'config.json'), 'utf-8'));
        expect(Array.isArray(config.curriculum)).toBe(true);
        expect(config.curriculum.length).toBeGreaterThan(0);
      });

      it('should have sections defined', () => {
        const config = JSON.parse(readFileSync(join(AGENTS_DIR, agent, 'config.json'), 'utf-8'));
        expect(config.sections).toBeDefined();
      });
    });
  }

  describe('orchestrator (code-driven)', () => {
    it('should have isCodeDriven: true', () => {
      const config = JSON.parse(readFileSync(join(AGENTS_DIR, 'orchestrator', 'config.json'), 'utf-8'));
      expect(config.isCodeDriven).toBe(true);
    });

    it('should have null model', () => {
      const config = JSON.parse(readFileSync(join(AGENTS_DIR, 'orchestrator', 'config.json'), 'utf-8'));
      expect(config.model).toBeNull();
    });

    it('should have sectionMapping for all 3 stages', () => {
      const config = JSON.parse(readFileSync(join(AGENTS_DIR, 'orchestrator', 'config.json'), 'utf-8'));
      expect(config.sectionMapping).toBeDefined();
      expect(config.sectionMapping.onePager).toBeDefined();
      expect(config.sectionMapping.pitchDeck).toBeDefined();
      expect(config.sectionMapping.fullStory).toBeDefined();
    });

    it('should have checkpointRules with fgrRequiresConfirmation', () => {
      const config = JSON.parse(readFileSync(join(AGENTS_DIR, 'orchestrator', 'config.json'), 'utf-8'));
      expect(config.checkpointRules.fgrRequiresConfirmation).toBe(true);
    });
  });
});
