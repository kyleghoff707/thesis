// Quality JSON to human-readable markdown report formatter.
// Converts critic.js validateStage output into a PM-scannable markdown document.

const SECTION_LABELS = {
  radar: 'Radar',
  simple_predictable: 'Simple & Predictable',
  market_position: 'Market Position',
  barriers_moats: 'Barriers & Moats',
  fcf: 'Free Cash Flow',
  management: 'Management',
  roe_roic_debt: 'ROE/ROIC/Debt',
  balance_sheet: 'Balance Sheet',
  pest: 'PEST Risk Analysis',
  valuation: 'Valuation',
  company_info: 'Company Info',
  minimum_standards: 'Minimum Standards',
  meaning_management: 'Meaning & Management',
  growth: 'Growth Metrics',
  summary: 'Summary',
};

function labelFor(key) {
  if (SECTION_LABELS[key]) return SECTION_LABELS[key];
  // Fallback: title-case from snake_case
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function fmtDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function stageTitle(stage) {
  if (stage === 'pitch-deck') return 'Pitch Deck';
  if (stage === 'one-pager') return 'One Pager';
  return stage || 'Report';
}

function issueCounts(issues) {
  let high = 0, med = 0, low = 0;
  for (const i of issues) {
    if (i.severity === 'high') high++;
    else if (i.severity === 'medium') med++;
    else low++;
  }
  return { high, med, low };
}

function focusNote(section) {
  const { high, med } = issueCounts(section.issues || []);
  const comp = section.completeness?.score ?? 100;
  const parts = [];

  if (comp < 80) {
    const present = section.completeness?.requiredFieldsPresent ?? '?';
    const total = section.completeness?.requiredFieldsTotal ?? '?';
    parts.push(`missing required fields (${present}/${total} present)`);
  }
  if (high > 0) {
    // Find dominant high-severity issue type
    const types = {};
    for (const i of (section.issues || [])) {
      if (i.severity === 'high') types[i.type] = (types[i.type] || 0) + 1;
    }
    const dominant = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    parts.push(`${dominant[1]} high: ${dominant[0].replace('_', ' ')}`);
  }
  if (parts.length === 0 && med > 0) {
    parts.push(`${med} medium-severity issues`);
  }
  if (parts.length === 0) {
    const lowCount = issueCounts(section.issues || []).low;
    if (lowCount > 10) parts.push('citation cleanup');
    else parts.push('minor citation issues');
  }

  return parts.join('; ');
}

export function formatQualityReport(qualityJson, options = {}) {
  if (!qualityJson || !qualityJson.sections) {
    return '# Quality Report\n\nNo quality data available.\n';
  }

  const { ticker, stage } = options;
  const title = [ticker, stageTitle(stage)].filter(Boolean).join(' ');
  const sections = qualityJson.sections;
  const lines = [];

  // Header
  const status = qualityJson.overallPassed ? 'PASS' : 'FAIL';
  const methScore = qualityJson.overallMethodologyScore != null ? `${qualityJson.overallMethodologyScore}/100` : '--';
  lines.push(`# Quality Report: ${title}`);
  lines.push('');
  lines.push(`**Score: ${qualityJson.overallScore}/100** | **Methodology: ${methScore}** | **Status: ${status}** | **Generated: ${fmtDate(qualityJson.checkedAt)}**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Section Breakdown Table
  lines.push('## Section Breakdown');
  lines.push('');
  lines.push('| # | Section | Score | Meth | Completeness | Pass | High | Med | Low |');
  lines.push('|---|---------|-------|------|-------------|------|------|-----|-----|');
  sections.forEach((s, idx) => {
    const { high, med, low } = issueCounts(s.issues || []);
    const comp = s.completeness?.score != null ? `${s.completeness.score}%` : '--';
    const meth = s.methodology?.score != null ? String(s.methodology.score) : '--';
    const pass = s.passed ? 'Yes' : 'No';
    lines.push(`| ${idx + 1} | ${labelFor(s.sectionKey)} | ${s.score} | ${meth} | ${comp} | ${pass} | ${high} | ${med} | ${low} |`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');

  // High-Severity Issues
  lines.push('## High-Severity Issues');
  lines.push('');
  lines.push('> These must be addressed before the report is considered reliable.');
  lines.push('');

  const highSections = sections.filter(s =>
    (s.issues || []).some(i => i.severity === 'high')
  );

  if (highSections.length === 0) {
    lines.push('No high-severity issues found.');
  } else {
    highSections.forEach((s) => {
      lines.push(`**${labelFor(s.sectionKey)}** (score: ${s.score})`);
      const highIssues = (s.issues || []).filter(i => i.severity === 'high');
      for (const issue of highIssues) {
        lines.push(`- [${issue.type}] ${issue.message}`);
      }
      lines.push('');
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Methodology Gaps
  lines.push('## Methodology Gaps');
  lines.push('');
  lines.push('> Rule One curriculum compliance per section. Critical checks are weighted 2x.');
  lines.push('');

  const methGapSections = sections.filter(s =>
    s.methodology?.score != null && s.methodology.score < 100
  );

  if (methGapSections.length === 0) {
    lines.push('All sections pass methodology checks.');
  } else {
    methGapSections.forEach((s) => {
      lines.push(`**${labelFor(s.sectionKey)}** (methodology: ${s.methodology.score}/100)`);
      const checks = s.methodology.checks || [];
      for (const check of checks) {
        const status = check.passed ? 'PASS' : 'FAIL';
        const weight = check.critical ? 'critical' : 'supplementary';
        lines.push(`- [${status}] [${weight}] ${check.label}`);
      }
      lines.push('');
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Remediation Priority
  lines.push('## Remediation Priority');
  lines.push('');
  lines.push('Sections ranked by urgency (lowest score + most high-severity issues first):');
  lines.push('');

  const sorted = [...sections].sort((a, b) => {
    const diff = a.score - b.score;
    if (diff !== 0) return diff;
    // Tiebreaker: more high issues = higher priority
    const aHigh = issueCounts(a.issues || []).high;
    const bHigh = issueCounts(b.issues || []).high;
    return bHigh - aHigh;
  });

  sorted.forEach((s, idx) => {
    const { high } = issueCounts(s.issues || []);
    const comp = s.completeness?.score != null ? `${s.completeness.score}%` : '--';
    lines.push(`${idx + 1}. **${labelFor(s.sectionKey)}** (score: ${s.score}) -- ${high} high issues, completeness ${comp}. Focus: ${focusNote(s)}.`);
  });

  lines.push('');
  lines.push('---');
  lines.push('');

  // Scoring Methodology
  lines.push('## Scoring Methodology');
  lines.push('');
  lines.push('**Mechanical score** (existing): 40% required fields, 25% narrative depth, 20% citations, 15% data population. Penalties for high/medium/low issues.');
  lines.push('');
  lines.push('**Methodology score** (new): Checks Rule One curriculum compliance per section. Critical elements weighted 2x. Score = passed weight / total weight * 100.');
  lines.push('');
  lines.push('Issue types: `citation` (source quality), `search_compliance` (web research requirements), `confidence` (claim-source alignment).');
  lines.push('Severity levels: `high` (must fix), `medium` (should fix), `low` (nice to fix).');
  lines.push('');

  return lines.join('\n');
}
