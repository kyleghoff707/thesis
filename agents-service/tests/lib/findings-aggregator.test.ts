import { describe, it, expect } from 'vitest';
import { aggregateFindings } from '../../src/lib/findings-aggregator.js';
import type { CrossCuttingFinding } from '../../src/agents/schemas/report-section.js';

const f = (source: string, finding: string, severity: 'high' | 'medium' | 'low'): CrossCuttingFinding => ({
  source, finding, severity, relevantAgents: [],
});

describe('aggregateFindings', () => {
  it('dedupes by source + normalized text (case + whitespace)', () => {
    const wave = [{ crossCuttingFindings: [
      f('financial-analyst', 'High debt load', 'high'),
      f('financial-analyst', 'high  DEBT load  ', 'high'),
    ]}];
    expect(aggregateFindings([], wave)).toHaveLength(1);
  });

  it('keeps findings from different sources even with same text', () => {
    const wave = [{ crossCuttingFindings: [
      f('financial-analyst', 'high debt', 'high'),
      f('risk-analyst',      'high debt', 'high'),
    ]}];
    expect(aggregateFindings([], wave)).toHaveLength(2);
  });

  it('sorts by severity (high → medium → low) then source A→Z', () => {
    const wave = [{ crossCuttingFindings: [
      f('z-source', 'a', 'low'),
      f('a-source', 'b', 'high'),
      f('b-source', 'c', 'high'),
      f('c-source', 'd', 'medium'),
    ]}];
    const result = aggregateFindings([], wave);
    expect(result.map(r => r.source)).toEqual(['a-source', 'b-source', 'c-source', 'z-source']);
  });

  it('preserves prior findings cumulatively across waves', () => {
    const prior = [f('x', 'p1', 'medium')];
    const wave = [{ crossCuttingFindings: [f('y', 'p2', 'low')] }];
    expect(aggregateFindings(prior, wave)).toHaveLength(2);
  });

  it('handles wave outputs with missing crossCuttingFindings field', () => {
    const wave = [{}, { crossCuttingFindings: [f('a', 'x', 'high')] }];
    expect(aggregateFindings([], wave)).toHaveLength(1);
  });

  it('handles empty inputs', () => {
    expect(aggregateFindings([], [])).toEqual([]);
  });
});
