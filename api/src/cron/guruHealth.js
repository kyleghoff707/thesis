// Guru health monitoring — detects stale filings, name drift, and empty filings.
// Runs as a second pass after the monthly guru sync. Sends a single Brevo email
// digest when issues are detected. No repeat alerts until the issue resolves and recurs.

import { GURUS } from '../../../packages/sec-parsers/index.js';

const STALE_THRESHOLD_DAYS = 180; // 2 missed quarters
const ALERT_EMAIL = 'kyleghoff707@gmail.com';

function daysBetween(dateStr, now) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function normalizeForComparison(str) {
  return (str || '').trim().toLowerCase();
}

function determineStatus(guru, lastReport, signal, now) {
  if (signal?.emptyFiling) return 'empty_filing';
  if (signal?.secName && normalizeForComparison(signal.secName) !== normalizeForComparison(guru.fund)) {
    return 'name_drift';
  }
  if (daysBetween(lastReport, now) > STALE_THRESHOLD_DAYS) return 'stale';
  return 'ok';
}

function buildEmailBody(alerts) {
  const groups = { stale: [], name_drift: [], empty_filing: [] };
  for (const a of alerts) {
    groups[a.status].push(a);
  }

  const sections = [];

  if (groups.empty_filing.length > 0) {
    sections.push('EMPTY FILING');
    for (const a of groups.empty_filing) {
      sections.push(`  ${a.guru_name} (${a.fund_name}) — filed 13F for ${a.last_report_date || 'unknown'} with 0 positions`);
    }
    sections.push('');
  }

  if (groups.name_drift.length > 0) {
    sections.push('NAME DRIFT');
    for (const a of groups.name_drift) {
      sections.push(`  ${a.guru_name} — SEC name "${a.sec_filed_name}" ≠ tracked "${a.fund_name}"`);
    }
    sections.push('');
  }

  if (groups.stale.length > 0) {
    sections.push('STALE FILING');
    for (const a of groups.stale) {
      const days = a.last_report_date
        ? daysBetween(a.last_report_date, new Date())
        : 'never';
      const ago = typeof days === 'number' ? `${days} days ago` : 'no filings in D1';
      sections.push(`  ${a.guru_name} (${a.fund_name}) — last filed ${a.last_report_date || 'never'} (${ago})`);
    }
    sections.push('');
  }

  sections.push('---');
  sections.push('Issues resolve automatically when the guru\'s next filing is detected.');
  sections.push('Manual notes can be added via D1 console: guru_health.notes');

  return sections.join('\n');
}

export async function checkGuruHealth(env, healthSignals) {
  const now = new Date();

  // Get most recent report_date per guru from guru_holdings
  const rows = await env.DB.prepare(
    'SELECT guru_cik, MAX(report_date) as last_report FROM guru_holdings GROUP BY guru_cik'
  ).all();
  const lastReports = new Map(rows.results.map(r => [r.guru_cik, r.last_report]));

  const toAlert = [];

  for (const guru of GURUS) {
    const lastReport = lastReports.get(guru.cik) || null;
    const signal = healthSignals.get(guru.cik) || {};
    const status = determineStatus(guru, lastReport, signal, now);
    const secName = signal.secName || null;

    // Read existing row for alert_sent_at and notes preservation
    const existing = await env.DB.prepare(
      'SELECT alert_sent_at, notes FROM guru_health WHERE guru_cik = ?'
    ).bind(guru.cik).first();

    // Determine alert_sent_at:
    // - ok → clear (eligible for future alerts)
    // - newly non-ok (no prior alert) → null (will send email)
    // - already alerted for this issue → preserve (no repeat)
    const alertSentAt = status === 'ok' ? null
      : (existing?.alert_sent_at ?? null);

    await env.DB.prepare(`
      INSERT OR REPLACE INTO guru_health
      (guru_cik, guru_name, fund_name, last_report_date, last_checked_at, sec_filed_name, status, alert_sent_at, notes)
      VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
    `).bind(
      guru.cik, guru.name, guru.fund, lastReport, secName, status, alertSentAt,
      existing?.notes ?? null
    ).run();

    if (status !== 'ok' && !alertSentAt) {
      toAlert.push({
        guru_cik: guru.cik,
        guru_name: guru.name,
        fund_name: guru.fund,
        last_report_date: lastReport,
        sec_filed_name: secName,
        status,
      });
    }
  }

  // Send email digest if there are new alerts
  if (toAlert.length > 0 && env.BREVO_API_KEY) {
    const emailBody = buildEmailBody(toAlert);
    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Thesis', email: 'noreply@thesis-investing.com' },
          to: [{ email: ALERT_EMAIL }],
          subject: `Thesis Guru Health Alert — ${toAlert.length} issue(s) detected`,
          textContent: emailBody,
        }),
      });

      // Mark alerts as sent
      for (const a of toAlert) {
        await env.DB.prepare(
          "UPDATE guru_health SET alert_sent_at = datetime('now') WHERE guru_cik = ?"
        ).bind(a.guru_cik).run();
      }

      console.log(`Guru health: sent alert for ${toAlert.length} issue(s)`);
    } catch (err) {
      console.warn('Guru health: email send failed:', err.message);
      // alert_sent_at stays NULL — will retry next month
    }
  } else if (toAlert.length > 0) {
    console.warn('Guru health: BREVO_API_KEY not set, skipping email');
  }

  const issueCount = toAlert.length;
  const okCount = GURUS.length - issueCount;
  console.log(`Guru health check complete: ${okCount} ok, ${issueCount} new issue(s)`);
}
