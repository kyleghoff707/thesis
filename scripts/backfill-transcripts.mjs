#!/usr/bin/env node
// One-time R2 transcript backfill via Alpha Vantage (paid key).
// Run: node scripts/backfill-transcripts.mjs
//
// Fetches transcripts for all S&P 500 tickers (4 quarters each),
// uploads to R2 via the Worker's temporary upload endpoint.
// Safe to re-run — checks R2 before fetching.

import { readFileSync } from 'fs';

const AV_KEY = '0LVEVE3GDO9BVGKN';
const API_BASE = 'https://api.thes1sinvesting.com';
const RATE_MS = 900; // ~67 calls/min, under the 75/min paid limit
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getExpectedQuarters() {
  const now = new Date();
  let year = now.getFullYear();
  let q = Math.ceil((now.getMonth() + 1) / 3) - 1;
  if (q <= 0) { q = 4; year--; }
  const quarters = [];
  for (let i = 0; i < 4; i++) {
    quarters.push({ year, quarter: q });
    q--;
    if (q <= 0) { q = 4; year--; }
  }
  return quarters;
}

function formatTranscript(data) {
  if (!Array.isArray(data.transcript) || data.transcript.length === 0) return null;
  const lines = [`# Earnings Call Transcript`];
  if (data.symbol) lines.push(`**${data.symbol}** — ${data.quarter || ''}`);
  lines.push('');
  const participants = new Map();
  for (const seg of data.transcript) {
    if (seg.speaker && seg.title && !participants.has(seg.speaker))
      participants.set(seg.speaker, seg.title);
  }
  if (participants.size > 0) {
    lines.push('## Participants', '');
    for (const [name, title] of participants) lines.push(`- **${name}** — ${title}`);
    lines.push('', '---', '');
  }
  for (const seg of data.transcript) {
    lines.push(`**${seg.speaker || 'Unknown'}** *(${seg.title || ''})*:`, '', seg.content || '', '');
  }
  return lines.join('\n');
}

async function main() {
  const tickers = readFileSync('/tmp/sp500-tickers.txt', 'utf-8').trim().split('\n');
  const quarters = getExpectedQuarters();
  console.log(`Backfill: ${tickers.length} tickers × ${quarters.length} quarters`);
  console.log(`Quarters: ${quarters.map(q => `${q.year}Q${q.quarter}`).join(', ')}\n`);

  let stored = 0, skipped = 0, empty = 0, errors = 0, calls = 0;
  const startTime = Date.now();

  for (let t = 0; t < tickers.length; t++) {
    const ticker = tickers[t];

    // Check what's already in R2 for this ticker
    let existing = new Set();
    try {
      const listRes = await fetch(`${API_BASE}/data/transcripts/${ticker}`);
      const listData = await listRes.json();
      for (const tr of listData.transcripts || []) {
        existing.add(`${tr.year}Q${tr.quarter}`);
      }
    } catch {}

    for (const { year, quarter } of quarters) {
      const qStr = `${year}Q${quarter}`;
      if (existing.has(qStr)) { skipped++; continue; }

      // Fetch from AV
      const url = `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${ticker}&quarter=${qStr}&apikey=${AV_KEY}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        calls++;

        if (data.Note || data.Information) {
          console.log(`\n⚠ Rate limited at ${calls} calls. Pausing 60s...`);
          await sleep(60000);
          const res2 = await fetch(url);
          const data2 = await res2.json();
          calls++;
          if (data2.Note || data2.Information) {
            console.log('Still limited. Stopping.');
            console.log(`\nResult: ${stored} stored, ${empty} empty, ${skipped} skipped, ${errors} errors, ${calls} API calls`);
            process.exit(1);
          }
          Object.assign(data, data2);
        }

        if (data['Error Message'] || !data.transcript?.length) {
          empty++;
          await sleep(RATE_MS);
          continue;
        }

        const text = formatTranscript(data);
        if (!text) { empty++; await sleep(RATE_MS); continue; }

        // Upload to R2 via Worker
        const payload = {
          ticker, year, quarter,
          data: {
            text,
            meta: { source: 'alpha_vantage', quarter: qStr, year, quarterNum: quarter, fetchedAt: new Date().toISOString() },
          },
        };

        const upRes = await fetch(`${API_BASE}/health/upload-transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (upRes.ok) {
          stored++;
        } else {
          errors++;
          console.log(`\n  Upload failed for ${ticker} ${qStr}: ${upRes.status}`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const pct = ((t / tickers.length) * 100).toFixed(1);
        process.stdout.write(`\r[${pct}%] ${ticker} ${qStr} → ${stored} stored, ${empty} empty, ${skipped} skipped | ${calls} API calls | ${elapsed}s`);

        await sleep(RATE_MS);
      } catch (err) {
        errors++;
        console.log(`\n  Error ${ticker} ${qStr}: ${err.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n\nBackfill complete in ${elapsed}s: ${stored} stored, ${empty} empty, ${skipped} skipped, ${errors} errors, ${calls} API calls`);
}

main();
