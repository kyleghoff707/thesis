#!/usr/bin/env node
/**
 * Guru Audit Script
 * Run periodically to detect fund name changes, stale filings, or broken CIKs.
 *
 * Usage:  node validation/scripts/audit-gurus.mjs
 * Flags:  --fix   Output a corrected GURUS array to paste into gurus.js
 */

const GURUS = [
  { name: 'Bill Ackman', fund: 'Pershing Square Capital Management', cik: '0001336528' },
  { name: 'Jeffrey Ubben', fund: 'ValueAct Holdings', cik: '0001418814' },
  { name: 'Pat Dorsey', fund: 'Dorsey Asset Management', cik: '0001671657' },
  { name: 'Michael Larson', fund: 'Bill & Melinda Gates Foundation Trust', cik: '0001166559' },
  { name: 'Norbert Lou', fund: 'Punch Card Management', cik: '0001631664' },
  { name: 'Bruce Berkowitz', fund: 'Fairholme Capital Management', cik: '0001056831' },
  { name: 'Alex Roepers', fund: 'Atlantic Investment Management', cik: '0001063296' },
  { name: 'Fred Martin', fund: 'Disciplined Growth Investors', cik: '0001050442' },
  { name: 'Li Lu', fund: 'Himalaya Capital Management', cik: '0001709323' },
  { name: 'Glenn Greenberg', fund: 'Brave Warrior Advisors', cik: '0001553733' },
  { name: 'David Einhorn', fund: 'DME Capital Management', cik: '0001489933' },
  { name: 'Ako Capital', fund: 'Ako Capital LLP', cik: '0001376879' },
  { name: 'Stephen Mandel', fund: 'Lone Pine Capital', cik: '0001061165' },
  { name: 'Terry Smith', fund: 'Fundsmith LLP', cik: '0001569205' },
  { name: 'David Rolfe', fund: 'Wedgewood Partners', cik: '0000859804' },
  { name: 'Mason Hawkins', fund: 'Southeastern Asset Management', cik: '0000807985' },
  { name: 'Greg Alexander', fund: 'Conifer Management', cik: '0001773994' },
  { name: 'David Abrams', fund: 'Abrams Capital Management', cik: '0001358706' },
  { name: 'Seth Klarman', fund: 'Baupost Group', cik: '0001061768' },
  { name: 'Chuck Akre', fund: 'Akre Capital Management', cik: '0001112520' },
  { name: 'Francis Chou', fund: 'Chou Associates Management', cik: '0001389403' },
  { name: 'Mohnish Pabrai', fund: 'Dalal Street LLC', cik: '0001549575' },
  { name: 'Kahn Brothers', fund: 'Kahn Brothers Group', cik: '0001039565' },
  { name: 'Wallace Weitz', fund: 'Weitz Investment Management', cik: '0000883965' },
  { name: 'Harry Burn', fund: 'Sound Shore Management', cik: '0000820124' },
  { name: 'Chris Davis', fund: 'Davis Selected Advisers', cik: '0001036325' },
  { name: 'Ronald Muhlenkamp', fund: 'Muhlenkamp & Co.', cik: '0001133219' },
  { name: 'Donald Yacktman', fund: 'Yacktman Asset Management', cik: '0000905567' },
  { name: 'Lindsell Train', fund: 'Lindsell Train Ltd', cik: '0001484150' },
  { name: 'Carl Icahn', fund: 'Icahn Carl C', cik: '0000921669' },
  { name: 'Prem Watsa', fund: 'Fairfax Financial Holdings', cik: '0000915191' },
  { name: 'Nelson Peltz', fund: 'Trian Fund Management', cik: '0001345471' },
  { name: 'Daniel Loeb', fund: 'Third Point LLC', cik: '0001040273' },
  { name: 'Chris Hohn', fund: 'TCI Fund Management', cik: '0001647251' },
  { name: 'Warren Buffett', fund: 'Berkshire Hathaway', cik: '0001067983' },
  { name: 'Chris Bloomstran', fund: 'Semper Augustus Investments Group', cik: '0001115373' },
  { name: 'Guy Spier', fund: 'Aquamarine Zurich AG', cik: '0001953324' },
  { name: 'Tweedy Browne', fund: 'Tweedy, Browne Co. LLC', cik: '0000732905' },
  { name: 'William Von Mueffling', fund: 'Cantillon Capital Management', cik: '0001279936' },
  { name: 'Michael Burry', fund: 'Scion Asset Management', cik: '0001649339' },
  { name: 'David Tepper', fund: 'Appaloosa LP', cik: '0001656456' },
  { name: 'Phil Town', fund: 'Rule One Fund', cik: '0002040263' },
  { name: 'Ray Dalio', fund: 'Bridgewater Associates', cik: '0001350694' },
];

const UA = { headers: { 'User-Agent': 'Thes1s/1.0 thesis-app@local' } };
const STALE_DAYS = 180; // flag if no 13F in last 6 months

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\s*\/\s*[\w]+\s*\/?/g, '')     // strip state/country identifiers like /MA/ /CT/ / CAN
    .replace(/\b(llc|llp|l\.?l\.?c\.?|l\.?p\.?|inc|ltd|co|corp|plc|sa|ag|the|group|of|fund|partners|management|capital|investments?|advisors?|associates?|holdings?|financial|trust|foundation|bill|melinda|gates)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function auditGuru(g) {
  const result = { ...g, issues: [] };

  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${g.cik}.json`, UA);
    if (!res.ok) {
      result.issues.push(`EDGAR returned ${res.status}`);
      return result;
    }
    const data = await res.json();
    result.edgarName = data.name || '??';

    // Check fund name match
    if (normalize(result.edgarName) !== normalize(g.fund)) {
      result.issues.push(`NAME MISMATCH: ours="${g.fund}" edgar="${result.edgarName}"`);
    }

    // Find latest 13F
    const f = data.filings?.recent;
    if (!f) { result.issues.push('No filings.recent'); return result; }

    let latest13F = null;
    for (let i = 0; i < f.form.length; i++) {
      if (f.form[i] === '13F-HR' || f.form[i] === '13F-HR/A') {
        latest13F = { form: f.form[i], filed: f.filingDate[i], report: f.reportDate[i], accession: f.accessionNumber[i] };
        break;
      }
    }

    if (!latest13F) {
      result.issues.push('NO 13F FILINGS FOUND');
      return result;
    }

    result.latestFiled = latest13F.filed;
    result.latestReport = latest13F.report;

    // Check staleness
    const age = daysSince(latest13F.filed);
    if (age > STALE_DAYS) {
      result.issues.push(`STALE: last filed ${age} days ago (${latest13F.filed})`);
    }

    // Check position count by fetching the infotable XML
    const accPath = latest13F.accession.replace(/-/g, '');
    const cikNum = parseInt(g.cik);
    const indexRes = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikNum}/${accPath}/index.json`, UA);
    if (indexRes.ok) {
      const indexData = await indexRes.json();
      const items = indexData.directory?.item || [];
      const infoFile = items.find(f => f.name.toLowerCase().includes('infotable') && f.name.endsWith('.xml'))
        || items.find(f => f.name.endsWith('.xml') && !f.name.includes('primary') && !f.name.includes('index') && !f.name.startsWith('R'));

      if (infoFile) {
        const xmlRes = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikNum}/${accPath}/${infoFile.name}`, UA);
        if (xmlRes.ok) {
          const xml = await xmlRes.text();
          const entries = xml.match(/<(?:\w+:)?infoTable>/g) || [];
          result.positions = entries.length;

          // Check for "No Securities" placeholder
          if (entries.length <= 1 && xml.includes('No Securities')) {
            result.positions = 0;
            result.issues.push('EMPTY PORTFOLIO: files "No Securities"');
          }
        }
      } else {
        result.issues.push('No infotable XML found in filing');
      }
    }
  } catch (e) {
    result.issues.push(`ERROR: ${e.message}`);
  }

  return result;
}

(async () => {
  console.log('Guru Audit — checking all 43 gurus against EDGAR...\n');

  const results = [];
  for (let i = 0; i < GURUS.length; i++) {
    const g = GURUS[i];
    process.stdout.write(`  [${(i + 1).toString().padStart(2)}/${GURUS.length}] ${g.name}...`);
    const r = await auditGuru(g);
    results.push(r);

    const status = r.issues.length === 0 ? '✅' : `⚠️  ${r.issues.join(' | ')}`;
    const posStr = r.positions != null ? ` (${r.positions} pos)` : '';
    const dateStr = r.latestReport ? ` [${r.latestReport}]` : '';
    process.stdout.write(`\r  [${(i + 1).toString().padStart(2)}/${GURUS.length}] ${g.name.padEnd(22)} ${status}${posStr}${dateStr}\n`);

    await new Promise(r => setTimeout(r, 150)); // SEC rate limit
  }

  // Summary
  const issues = results.filter(r => r.issues.length > 0);
  const clean = results.filter(r => r.issues.length === 0);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SUMMARY: ${clean.length} clean, ${issues.length} with issues`);
  console.log(`${'═'.repeat(60)}`);

  if (issues.length > 0) {
    console.log('\nIssues found:');
    for (const r of issues) {
      console.log(`  ${r.name} (${r.cik}):`);
      for (const issue of r.issues) {
        console.log(`    → ${issue}`);
      }
    }
  }

  // --fix flag: output corrected GURUS array with EDGAR names
  if (process.argv.includes('--fix')) {
    const nameChanges = results.filter(r =>
      r.edgarName && normalize(r.edgarName) !== normalize(r.fund)
    );
    if (nameChanges.length > 0) {
      console.log('\n\nSuggested fund name updates for gurus.js:');
      for (const r of nameChanges) {
        console.log(`  { name: '${r.name}', fund: '${r.edgarName}', cik: '${r.cik}' },`);
      }
    }
  }

  console.log('\nDone.');
})();
