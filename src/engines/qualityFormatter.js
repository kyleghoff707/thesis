// qualityFormatter.js — Format validateStage() output as readable markdown
// Used by run-pipeline.js and run-quality-v4.js for quality report files

export function formatQualityReport(report, { ticker, stage } = {}) {
  const lines = [];
  lines.push(`# Quality Report: ${ticker || '?'} — ${stage || '?'}`);
  lines.push(`**Checked:** ${report.checkedAt}`);
  lines.push(`**Mechanical Score:** ${report.overallScore}/100`);
  lines.push(`**Methodology Score:** ${report.overallMethodologyScore}/100`);
  lines.push(`**Passed:** ${report.overallPassed ? 'Yes' : 'No'}`);
  lines.push('');

  if (report.sections?.length > 0) {
    lines.push('## Sections');
    lines.push('');
    lines.push('| # | Key | Score | Methodology | Passed |');
    lines.push('|---|-----|-------|-------------|--------|');
    for (const s of report.sections) {
      const num = s.sectionNumber || '?';
      const key = s.key || '?';
      const score = s.score ?? '?';
      const meth = s.methodology?.score ?? '?';
      const passed = s.passed ? 'Yes' : 'No';
      lines.push(`| ${num} | ${key} | ${score} | ${meth} | ${passed} |`);
    }
    lines.push('');

    // Detail failures
    const failures = report.sections.filter(s => !s.passed);
    if (failures.length > 0) {
      lines.push('## Failures');
      lines.push('');
      for (const s of failures) {
        lines.push(`### ${s.key || '?'} (score: ${s.score})`);
        if (s.issues?.length > 0) {
          for (const issue of s.issues) {
            lines.push(`- ${issue}`);
          }
        }
        if (s.methodology?.issues?.length > 0) {
          lines.push('**Methodology issues:**');
          for (const issue of s.methodology.issues) {
            lines.push(`- ${issue}`);
          }
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
