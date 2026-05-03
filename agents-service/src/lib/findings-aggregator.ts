import type { CrossCuttingFinding } from '../agents/schemas/report-section.js';

interface HasFindings {
  crossCuttingFindings?: CrossCuttingFinding[];
}

const SEVERITY_RANK: Record<CrossCuttingFinding['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fingerprint(f: CrossCuttingFinding): string {
  return `${f.source}|${normalizeText(f.finding)}`;
}

/**
 * Merge findings from a wave's outputs with cumulative findings from prior waves.
 * Dedupes by source+text. Sorts by severity (high → low) then source A→Z.
 *
 * Pure CPU — no Anthropic call. Deterministic. Idempotent across Inngest step replays.
 */
export function aggregateFindings(
  prior: CrossCuttingFinding[],
  waveOutputs: HasFindings[],
): CrossCuttingFinding[] {
  const map = new Map<string, CrossCuttingFinding>();
  for (const f of prior) {
    map.set(fingerprint(f), f);
  }
  for (const out of waveOutputs) {
    for (const f of out?.crossCuttingFindings ?? []) {
      const fp = fingerprint(f);
      if (!map.has(fp)) map.set(fp, f);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const sevDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDelta !== 0) return sevDelta;
    return a.source.localeCompare(b.source);
  });
}
