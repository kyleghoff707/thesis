// Cron job dispatcher
//
// Schedule:
//   "0 */3 * * *"   — Every 3hr: transcript sync (6 AV calls per run)
//   "0 6 * * *"     — Daily 6AM: insider trades sync (50 tickers per run)
//   "0 3 1 * *"     — Monthly 1st 3AM: guru holdings sync (43 funds)
//   "0 2 * * SUN"   — Sunday 2AM: taxonomy refresh (IPOs, delistings, S&P 500)
//   "0 5 * * SUN"   — Sunday 5AM: stale data cleanup

import { syncTranscripts } from './transcripts.js';
import { syncInsiders } from './insiders.js';
import { syncGurus } from './gurus.js';
import { refreshTaxonomy } from './taxonomy.js';
import { cleanupStale } from './cleanup.js';

export async function handleCron(event, env) {
  const cron = event.cron;
  console.log(`Cron triggered: ${cron} at ${new Date().toISOString()}`);

  try {
    switch (cron) {
      case '0 */3 * * *':
        await syncTranscripts(env);
        break;
      case '0 6 * * *':
        await syncInsiders(env);
        break;
      case '0 3 1 * *':
        await syncGurus(env);
        break;
      case '0 2 * * SUN':
        await refreshTaxonomy(env);
        break;
      case '0 5 * * SUN':
        await cleanupStale(env);
        break;
      default:
        console.warn(`Unknown cron schedule: ${cron}`);
    }
  } catch (err) {
    console.error(`Cron ${cron} failed:`, err.message);
    await env.DB.prepare(
      'INSERT OR REPLACE INTO sync_status (job_name, last_run, status, error) VALUES (?, datetime(\'now\'), \'error\', ?)'
    ).bind(cron, err.message).run();
  }
}
