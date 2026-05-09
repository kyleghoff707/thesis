// Stale data cleanup — deletes old records across all tables.
//
// Schedule: weekly, Sunday 5 AM UTC.
// - Guru holdings older than 5 years
// - Insider trades older than 3 years
// - Expired sessions
// - Orphan reports (no stages, older than 24h)
// - R2 transcripts older than 2 years

export async function cleanupStale(env) {
  let totalDeleted = 0;

  // 1. Old guru holdings
  const guruResult = await env.DB.prepare(
    "DELETE FROM guru_holdings WHERE report_date < date('now', '-5 years')"
  ).run();
  const guruDeleted = guruResult.meta?.changes || 0;
  totalDeleted += guruDeleted;

  // 2. Old insider trades
  const insiderResult = await env.DB.prepare(
    "DELETE FROM insider_trades WHERE transaction_date < date('now', '-3 years')"
  ).run();
  const insiderDeleted = insiderResult.meta?.changes || 0;
  totalDeleted += insiderDeleted;

  // 3. Expired sessions
  const sessionResult = await env.DB.prepare(
    "DELETE FROM sessions WHERE expires_at < datetime('now')"
  ).run();
  totalDeleted += sessionResult.meta?.changes || 0;

  // 4. Orphan reports (no stages, older than 24h — gives active pipelines time to finish)
  const orphanResult = await env.DB.prepare(
    `DELETE FROM reports WHERE created_at < datetime('now', '-1 day')
     AND NOT EXISTS (SELECT 1 FROM report_stages rs WHERE rs.report_id = reports.id)`
  ).run();
  const orphanDeleted = orphanResult.meta?.changes || 0;
  totalDeleted += orphanDeleted;

  // 5. Old R2 transcripts (older than 2 years)
  const cutoffYear = new Date().getFullYear() - 2;
  const listed = await env.TRANSCRIPTS.list({ limit: 1000 });
  let r2Deleted = 0;
  for (const obj of listed.objects) {
    const match = obj.key.match(/transcripts\/[A-Z.]+\/(\d{4})\//);
    if (match && parseInt(match[1]) < cutoffYear) {
      await env.TRANSCRIPTS.delete(obj.key);
      r2Deleted++;
    }
  }
  totalDeleted += r2Deleted;

  await env.DB.prepare(
    'INSERT OR REPLACE INTO sync_status (job_name, last_run, last_offset, status, items_processed, error) VALUES (?, datetime(\'now\'), 0, \'complete\', ?, NULL)'
  ).bind('cleanup', totalDeleted).run();

  console.log(`Cleanup: ${guruDeleted} guru rows, ${insiderDeleted} insider rows, ${orphanDeleted} orphan reports, ${r2Deleted} R2 transcripts, ${totalDeleted} total deleted`);
}
