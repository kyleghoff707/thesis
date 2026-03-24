// Structural validation tests for all agent definitions
// Validates: directory structure, config.json schema, curriculum paths,
// contamination boundary, compression policy, tool validity

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

// Use the project root (not worktree) for curriculum file checks
// because knowledge/ is gitignored and only exists in the main repo.
// In CI/production, knowledge/ will be present.
const PROJECT_ROOT = process.cwd();
const AGENTS_DIR = join(PROJECT_ROOT, 'agents');

// Check main repo for curriculum files (worktree may not have knowledge/).
// Worktrees live under <main-repo>/.claude/worktrees/<id>/ — resolve via .git file.
function findMainRepo() {
  const gitPath = join(PROJECT_ROOT, '.git');
  if (existsSync(gitPath) && statSync(gitPath).isFile()) {
    // Worktree: .git is a file containing "gitdir: /path/to/.git/worktrees/<id>"
    const gitContent = readFileSync(gitPath, 'utf8').trim();
    const match = gitContent.match(/gitdir:\s*(.+)/);
    if (match) {
      // Go from .git/worktrees/<id> up to .git, then up one more to repo root
      const gitDir = resolve(match[1].trim());
      return resolve(gitDir, '..', '..', '..');
    }
  }
  return PROJECT_ROOT;
}
const MAIN_REPO = findMainRepo();
const CURRICULUM_ROOT = existsSync(join(PROJECT_ROOT, 'knowledge'))
  ? PROJECT_ROOT
  : existsSync(join(MAIN_REPO, 'knowledge'))
    ? MAIN_REPO
    : PROJECT_ROOT;

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
const AI_AGENTS = EXPECTED_AGENTS.filter(a => a !== 'data-assembler' && a !== 'orchestrator');

// Known tool names from src/engines/toolbox.js TOOL_DEFINITIONS
const KNOWN_TOOLS = [
  'computeMOS',
  'computePBT',
  'computeTenCap',
  'computeEquityBond',
  'sensitivityTable',
  'fcfPerShare',
  'yearsToPayback',
  'getMetric',
  'getFinancialLine',
  'computeGrowthRates',
  'comparePeers',
  'readFilingSection',
  'getTranscriptExcerpt',
];

// Required config.json fields for AI agents
const REQUIRED_AI_FIELDS = [
  'role',
  'model',
  'curriculum',
  'universalContext',
  'dataPacketSlice',
  'tools',
  'exampleContamination',
  'sections',
];

// Required config.json fields for data-assembler (no compressionPolicy)
const REQUIRED_DA_FIELDS = [
  'role',
  'model',
  'curriculum',
  'universalContext',
  'dataPacketSlice',
  'tools',
  'sections',
];

// Helper: load config.json for an agent
function loadConfig(agent) {
  const path = join(AGENTS_DIR, agent, 'config.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('Agent Definitions — Directory Structure', () => {
  it('Test 1: All 9 agent directories exist under agents/', () => {
    for (const agent of EXPECTED_AGENTS) {
      const dir = join(AGENTS_DIR, agent);
      expect(existsSync(dir), `Missing directory: agents/${agent}`).toBe(true);
    }
  });

  it('Test 2: Each agent directory has config.json', () => {
    for (const agent of EXPECTED_AGENTS) {
      const path = join(AGENTS_DIR, agent, 'config.json');
      expect(existsSync(path), `Missing: agents/${agent}/config.json`).toBe(true);
    }
  });

  it('Test 3: Each agent directory has README.md', () => {
    for (const agent of EXPECTED_AGENTS) {
      const path = join(AGENTS_DIR, agent, 'README.md');
      expect(existsSync(path), `Missing: agents/${agent}/README.md`).toBe(true);
    }
  });

  it('Test 4: Each AI agent directory (not data-assembler) has prompt.md', () => {
    for (const agent of AI_AGENTS) {
      const path = join(AGENTS_DIR, agent, 'prompt.md');
      expect(existsSync(path), `Missing: agents/${agent}/prompt.md`).toBe(true);
    }
    // data-assembler should NOT have prompt.md
    const daPrompt = join(AGENTS_DIR, 'data-assembler', 'prompt.md');
    expect(existsSync(daPrompt), 'data-assembler should NOT have prompt.md').toBe(false);
  });
});

describe('Agent Definitions — Config Schema', () => {
  it('Test 5: Each config.json has all required fields', () => {
    for (const agent of EXPECTED_AGENTS) {
      const config = loadConfig(agent);
      const isNonAI = agent === 'data-assembler' || agent === 'orchestrator';
      const requiredFields = isNonAI ? REQUIRED_DA_FIELDS : REQUIRED_AI_FIELDS;
      for (const field of requiredFields) {
        expect(
          field in config,
          `agents/${agent}/config.json missing field: ${field}`
        ).toBe(true);
      }
    }
  });

  it('Test 8: All AI agents (not data-assembler) have universalContext: true', () => {
    for (const agent of AI_AGENTS) {
      const config = loadConfig(agent);
      expect(
        config.universalContext,
        `agents/${agent}/config.json should have universalContext: true`
      ).toBe(true);
    }
  });

  it('Test 9: data-assembler has universalContext: false and model: null', () => {
    const config = loadConfig('data-assembler');
    expect(config.universalContext).toBe(false);
    expect(config.model).toBe(null);
  });
});

describe('Agent Definitions — Contamination Boundary', () => {
  it('Test 6: No config.json curriculum array contains paths with "LULU" or "examples/"', () => {
    for (const agent of EXPECTED_AGENTS) {
      const config = loadConfig(agent);
      for (const path of config.curriculum || []) {
        expect(
          path.includes('LULU'),
          `agents/${agent}/config.json curriculum contains LULU: ${path}`
        ).toBe(false);
        expect(
          path.includes('examples/'),
          `agents/${agent}/config.json curriculum contains examples/: ${path}`
        ).toBe(false);
      }
    }
  });

  it('Test 11: exampleContamination.exclude includes at least 3 exclusion paths for all AI agents', () => {
    for (const agent of AI_AGENTS) {
      const config = loadConfig(agent);
      const excludes = config.exampleContamination?.exclude || [];
      expect(
        excludes.length,
        `agents/${agent}/config.json should have at least 3 contamination exclusion paths, found ${excludes.length}`
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Agent Definitions — Curriculum Validation', () => {
  it('Test 7: All curriculum file paths in config.json reference files that exist on disk', () => {
    for (const agent of EXPECTED_AGENTS) {
      const config = loadConfig(agent);
      for (const currPath of config.curriculum || []) {
        const fullPath = join(CURRICULUM_ROOT, currPath);
        expect(
          existsSync(fullPath),
          `agents/${agent}/config.json references missing curriculum: ${currPath} (checked ${fullPath})`
        ).toBe(true);
      }
    }
  });

  it('Test 14: All curriculum paths point to REAL curriculum files (not summaries) — file size > 1000 bytes', () => {
    for (const agent of EXPECTED_AGENTS) {
      const config = loadConfig(agent);
      for (const currPath of config.curriculum || []) {
        const fullPath = join(CURRICULUM_ROOT, currPath);
        if (existsSync(fullPath)) {
          const stats = statSync(fullPath);
          if (stats.isFile()) {
            expect(
              stats.size,
              `agents/${agent}/config.json curriculum file too small (likely summary): ${currPath} (${stats.size} bytes)`
            ).toBeGreaterThan(1000);
          }
          // Directories (like buffett_letters_claude_training_set/) are valid — skip size check
        }
      }
    }
  });
});

describe('Agent Definitions — Tool Validation', () => {
  it('Test 10: All tool names in config.json tools arrays are valid (exist in TOOL_DEFINITIONS)', () => {
    for (const agent of EXPECTED_AGENTS) {
      const config = loadConfig(agent);
      for (const tool of config.tools || []) {
        expect(
          KNOWN_TOOLS.includes(tool),
          `agents/${agent}/config.json has unknown tool: ${tool}`
        ).toBe(true);
      }
    }
  });
});

describe('Agent Definitions — Section Uniqueness', () => {
  it('Test 12: No two agents have the exact same sections assignment', () => {
    const sectionSignatures = {};
    for (const agent of EXPECTED_AGENTS) {
      const config = loadConfig(agent);
      const sig = JSON.stringify(config.sections);
      if (sig in sectionSignatures) {
        // data-assembler and primary-source-reader both have empty sections — that's OK for pre-processing agents
        const other = sectionSignatures[sig];
        const preProcessing = ['data-assembler', 'primary-source-reader'];
        if (preProcessing.includes(agent) && preProcessing.includes(other)) {
          continue; // Pre-processing agents can share empty sections
        }
        expect.fail(
          `agents/${agent} and agents/${other} have identical section assignments: ${sig}`
        );
      }
      sectionSignatures[sig] = agent;
    }
  });
});

describe('Agent Definitions — Compression Policy (AGNT-03)', () => {
  it('Test 13: All AI agent config.json files have compressionPolicy set to "none"', () => {
    for (const agent of AI_AGENTS) {
      const config = loadConfig(agent);
      expect(
        config.compressionPolicy,
        `agents/${agent}/config.json should have compressionPolicy: "none" (AGNT-03)`
      ).toBe('none');
    }
  });
});
