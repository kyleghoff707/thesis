// Structural validation tests for the CC skill SKILL.md and assemble-data.js
// Validates: skill frontmatter, pipeline references, quality constraints,
// output formats, cross-reference with dispatch-table.json

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();
const SKILL_PATH = join(PROJECT_ROOT, '.claude', 'skills', 'generate-one-pager', 'SKILL.md');
const SCRIPT_PATH = join(PROJECT_ROOT, 'scripts', 'assemble-data.js');
const DISPATCH_TABLE_PATH = join(PROJECT_ROOT, 'agents', 'orchestrator', 'dispatch-table.json');

// Helper: read file content
function readFile(path) {
  return readFileSync(path, 'utf8');
}

// Helper: extract YAML frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      fm[key.trim()] = rest.join(':').trim();
    }
  }
  return fm;
}

describe('CC Skill — SKILL.md Exists and Has Correct Frontmatter', () => {
  it('SKILL.md exists at .claude/skills/generate-one-pager/', () => {
    expect(existsSync(SKILL_PATH), `Missing: ${SKILL_PATH}`).toBe(true);
  });

  it('frontmatter contains name: generate-one-pager', () => {
    const fm = parseFrontmatter(readFile(SKILL_PATH));
    expect(fm.name).toBe('generate-one-pager');
  });

  it('frontmatter contains disable-model-invocation: true', () => {
    const fm = parseFrontmatter(readFile(SKILL_PATH));
    expect(fm['disable-model-invocation']).toBe('true');
  });

  it('frontmatter contains description', () => {
    const fm = parseFrontmatter(readFile(SKILL_PATH));
    expect(fm.description).toBeDefined();
    expect(fm.description.length).toBeGreaterThan(10);
  });

  it('frontmatter contains argument-hint', () => {
    const fm = parseFrontmatter(readFile(SKILL_PATH));
    expect(fm['argument-hint']).toBeDefined();
  });
});

describe('CC Skill — Pipeline Component References', () => {
  it('references dispatch-table (reads config at runtime, not hardcoded)', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('dispatch-table');
  });

  it('references prompt.md (reads agent prompts)', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('prompt.md');
  });

  it('references ReportSectionSchema (validates outputs)', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('ReportSectionSchema');
  });

  it('references data assembly step', () => {
    const content = readFile(SKILL_PATH);
    const hasAssembleData = content.includes('assemble-data') || content.includes('assembleDataPacket');
    expect(hasAssembleData).toBe(true);
  });
});

describe('CC Skill — Quality Constraints', () => {
  it('contains contamination boundary', () => {
    const content = readFile(SKILL_PATH);
    const hasContamination = content.includes('contamination') || content.includes('NEVER read');
    expect(hasContamination).toBe(true);
  });

  it('does NOT contain LULU or lululemon (contamination-free)', () => {
    const content = readFile(SKILL_PATH);
    expect(content.includes('LULU')).toBe(false);
    expect(content.toLowerCase().includes('lululemon')).toBe(false);
  });

  it('documents parallel analyst dispatch', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('parallel');
  });

  it('documents sequential synthesis step', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('synthesis-writer');
  });
});

describe('CC Skill — Expected Outputs', () => {
  it('references one-pager.json output', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('one-pager.json');
  });

  it('references one-pager.md output', () => {
    const content = readFile(SKILL_PATH);
    expect(content).toContain('one-pager.md');
  });

  it('references per-section output directory', () => {
    const content = readFile(SKILL_PATH);
    const hasSections = content.includes('sections/') || content.includes('section_key');
    expect(hasSections).toBe(true);
  });
});

describe('CC Skill — assemble-data.js Structure', () => {
  it('scripts/assemble-data.js exists', () => {
    expect(existsSync(SCRIPT_PATH), `Missing: ${SCRIPT_PATH}`).toBe(true);
  });

  it('imports nodeAdapter', () => {
    const content = readFile(SCRIPT_PATH);
    expect(content).toContain('nodeAdapter');
  });

  it('imports assembleDataPacket or dataExport', () => {
    const content = readFile(SCRIPT_PATH);
    const hasImport = content.includes('assembleDataPacket') || content.includes('dataExport');
    expect(hasImport).toBe(true);
  });

  it('reads CLI arguments from process.argv', () => {
    const content = readFile(SCRIPT_PATH);
    expect(content).toContain('process.argv');
  });

  it('writes to .thes1s/reports output directory', () => {
    const content = readFile(SCRIPT_PATH);
    expect(content).toContain('.thes1s');
    expect(content).toContain('reports');
  });
});

describe('CC Skill — Cross-Reference with dispatch-table.json', () => {
  it('SKILL.md mentions all 4 One Pager agent names from dispatch table', () => {
    const dispatchTable = JSON.parse(readFile(DISPATCH_TABLE_PATH));
    const onePager = dispatchTable.onePager;

    // Collect all unique agent names from dispatch table
    const agentNames = new Set();
    for (const phase of onePager.phases || []) {
      for (const agent of phase.agents || []) {
        agentNames.add(agent.agent);
      }
    }
    for (const step of onePager.postProcessing || []) {
      if (step.agent) agentNames.add(step.agent);
    }

    const content = readFile(SKILL_PATH);

    for (const agent of agentNames) {
      expect(
        content.includes(agent),
        `SKILL.md should reference agent: ${agent}`
      ).toBe(true);
    }
  });
});
