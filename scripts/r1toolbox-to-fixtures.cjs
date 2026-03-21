/**
 * r1toolbox-to-fixtures.cjs
 *
 * Reads R1 Toolbox CSVs from knowledge/r1-toolbox-financial-statements/Annual Examples/
 * Outputs JSON fixture files to src/engines/__tests__/fixtures/r1toolbox/{TICKER}.json
 *
 * R1 CSV format:
 *   - Header block (lines 1-13): download info, ticker, version, layout, report, price
 *   - Year header row: ,TTM,2025,2024,...,2016  (newest first)
 *   - Three sections in one file, separated by "----------Income Statement----------" etc.
 *   - Values: in millions (except per share data, ratios, and percentage data)
 *   - Dash "-" = null
 *   - Quoted field names
 *   - Two layouts: "Expanded" (more BS detail) and "Consolidated" (EPS/shares in IS)
 *   - Duplicate rows possible (keep first occurrence)
 *
 * Usage:  node scripts/r1toolbox-to-fixtures.cjs [TICKER]
 *   No args → process all companies
 *   With ticker → process just that one
 */

const fs = require('fs');
const path = require('path');

const R1_DIR = path.join(__dirname, '..', 'knowledge', 'r1-toolbox-financial-statements', 'Annual Examples');
const OUT_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'r1toolbox');

// Fields that are NOT in millions (per share, ratio, percentage)
const PER_SHARE_RATIO_FIELDS = new Set([
  'EPS (Basic)',
  'EPS (Diluted)',
  'Basic EPS',
  'Diluted EPS',
  'EPS (Basic) from Continuing Operations',
  'Diluted EPS from Continuing Operations',
  'Dividend Per Share',
  'Tax Rate For Calcs',
  'Tax Effect of Unusual Items',
  'Reported Effective Tax Rate',
]);

// ---------------------------------------------------------------------------
// CSV Parser — handles quoted fields, commas inside quotes
// ---------------------------------------------------------------------------

function parseCSVRows(content) {
  const rows = [];
  let currentRow = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      currentRow.push(field);
      if (currentRow.length > 0 && currentRow.some(c => c.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Flush last row
  currentRow.push(field);
  if (currentRow.length > 0 && currentRow.some(c => c.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Value Parser
// ---------------------------------------------------------------------------

function parseValue(raw, fieldName) {
  const s = (raw || '').trim();
  if (s === '' || s === '-') return null;

  // Remove trailing period if present
  const cleaned = s.endsWith('.') && s.length > 1 ? s.slice(0, -1) : s;
  const num = Number(cleaned);
  if (isNaN(num)) return null;

  // Convert millions to whole dollars for financial fields
  if (PER_SHARE_RATIO_FIELDS.has(fieldName)) {
    return num; // per share / ratio / percentage — keep as-is
  }
  return num * 1000000; // millions → whole dollars
}

// ---------------------------------------------------------------------------
// Section Detection
// ---------------------------------------------------------------------------

const SECTION_HEADERS = {
  '----------Income Statement----------': 'income',
  '----------Balance Sheet----------': 'balance_sheet',
  '----------Cash Flow----------': 'cash_flow',
};

function detectSection(row) {
  const field = (row[0] || '').trim();
  return SECTION_HEADERS[field] || null;
}

// ---------------------------------------------------------------------------
// Company Processor
// ---------------------------------------------------------------------------

function processCompany(ticker, filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSVRows(content);

  // Extract metadata from header block
  let layout = 'Unknown';
  let companyName = '';
  let exchange = '';
  let price = null;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    const firstCell = (row[0] || '').trim();

    // Exchange:TICKER,Company Name
    if (firstCell.includes(':') && firstCell.match(/^[A-Z]{3}:/)) {
      const parts = firstCell.split(':');
      exchange = parts[0];
      companyName = (row[1] || '').trim();
    }

    if (firstCell === 'Layout') {
      layout = (row[1] || '').trim();
    }
    if (firstCell === 'Price') {
      const priceStr = (row[1] || '').replace('$', '').trim();
      price = Number(priceStr) || null;
    }
  }

  // Find year header row (first cell empty, rest are years/TTM)
  let yearLabels = [];
  let yearRowIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if ((row[0] || '').trim() === '' && row.length > 2) {
      // Check if remaining cells look like years/TTM
      const possibleYears = row.slice(1).map(c => c.trim()).filter(c => c !== '');
      if (possibleYears.length >= 5 && (possibleYears[0] === 'TTM' || /^\d{4}$/.test(possibleYears[0]))) {
        yearLabels = possibleYears;
        yearRowIdx = i;
        break;
      }
    }
  }

  if (yearRowIdx === -1) {
    throw new Error(`Could not find year header row for ${ticker}`);
  }

  // Parse data rows by section
  const statements = {};
  let currentSection = null;
  const seenFields = {};

  for (let i = yearRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];

    // Check for section header
    const section = detectSection(row);
    if (section) {
      currentSection = section;
      seenFields[section] = new Set();
      statements[section] = {};
      for (const y of yearLabels) {
        statements[section][y] = {};
      }
      continue;
    }

    if (!currentSection) continue;

    const fieldName = (row[0] || '').trim();
    if (!fieldName) continue;

    // Skip metadata/summary rows
    if (fieldName.startsWith('Downloaded') || fieldName.startsWith('Filename')) continue;
    if (fieldName.startsWith('All Numbers')) continue;
    if (fieldName.match(/^\d+ Period/)) continue;

    // Deduplicate — keep first occurrence
    if (seenFields[currentSection].has(fieldName)) continue;
    seenFields[currentSection].add(fieldName);

    // Parse values per year
    for (let j = 0; j < yearLabels.length; j++) {
      const year = yearLabels[j];
      const val = parseValue(row[j + 1], fieldName);
      if (val !== null) {
        statements[currentSection][year][fieldName] = val;
      }
    }
  }

  // Build fixture
  const fixture = {
    ticker,
    source: 'r1toolbox',
    layout,
    companyName,
    exchange,
    statements,
  };

  return fixture;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateFixture(ticker, fixture) {
  const warnings = [];

  // Check all 3 statements present
  for (const st of ['income', 'balance_sheet', 'cash_flow']) {
    if (!fixture.statements[st]) {
      warnings.push(`Missing ${st} statement`);
    }
  }

  // Spot-check AAPL 2024 revenue (should be 391035 * 1M = 391035000000)
  if (ticker === 'AAPL') {
    const rev = fixture.statements.income?.['2024']?.['Revenue'];
    if (rev !== 391035000000) {
      warnings.push(`AAPL 2024 revenue: expected 391035000000, got ${rev}`);
    }
    const ni = fixture.statements.income?.['2024']?.['Net Income'];
    if (ni !== 93736000000) {
      warnings.push(`AAPL 2024 net income: expected 93736000000, got ${ni}`);
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const requestedTicker = process.argv[2];

  // Find all R1 CSV files and extract tickers
  const allFiles = fs.readdirSync(R1_DIR).filter(f => f.endsWith('.csv'));

  // Extract ticker from filename: RuleOneToolbox_{EXCHANGE}_{TICKER}_{Layout}_Financials_...
  const tickerFiles = {};
  for (const f of allFiles) {
    const match = f.match(/RuleOneToolbox_([A-Z]+)_([A-Z.]+)_(\w+)_Financials/);
    if (match) {
      const ticker = match[2].replace('.', '-'); // BRK.B → BRK-B for consistency
      tickerFiles[ticker] = { file: f, exchange: match[1], layout: match[3] };
    }
  }

  let tickers;
  if (requestedTicker) {
    const key = requestedTicker.replace('.', '-');
    if (!tickerFiles[key]) {
      console.error(`No R1 Toolbox data found for ${requestedTicker}`);
      process.exit(1);
    }
    tickers = [key];
  } else {
    tickers = Object.keys(tickerFiles).sort();
  }

  console.log(`\nR1 TOOLBOX CSV → JSON FIXTURE CONVERTER`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Processing ${tickers.length} companies...\n`);

  const summary = { processed: 0, errors: [], warnings: [] };

  for (const ticker of tickers) {
    const { file, layout } = tickerFiles[ticker];
    process.stdout.write(`  ${ticker.padEnd(8)}`);

    try {
      const filePath = path.join(R1_DIR, file);
      const fixture = processCompany(ticker, filePath);
      const warnings = validateFixture(ticker, fixture);

      // Stats line
      const parts = [`${layout}`];
      for (const st of ['income', 'balance_sheet', 'cash_flow']) {
        const label = st === 'income' ? 'IS' : st === 'balance_sheet' ? 'BS' : 'CF';
        const yearKeys = Object.keys(fixture.statements[st] || {});
        const firstYear = yearKeys[0];
        const fieldCount = firstYear ? Object.keys(fixture.statements[st][firstYear] || {}).length : 0;
        parts.push(`${label}:${fieldCount}f`);
      }
      const yearKeys = Object.keys(fixture.statements.income || {}).filter(y => y !== 'TTM');
      parts.push(`${yearKeys.length}yr`);
      if (warnings.length > 0) parts.push(`⚠ ${warnings.length}`);

      console.log(parts.join('  '));

      if (warnings.length > 0) {
        for (const w of warnings) {
          summary.warnings.push(`${ticker}: ${w}`);
        }
      }

      // Write fixture
      const outPath = path.join(OUT_DIR, `${ticker}.json`);
      fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));

      summary.processed++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      summary.errors.push(`${ticker}: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${summary.processed}/${tickers.length} companies processed`);

  if (summary.errors.length > 0) {
    console.log(`\nERRORS (${summary.errors.length}):`);
    for (const e of summary.errors) console.log(`  ✗ ${e}`);
  }

  if (summary.warnings.length > 0) {
    console.log(`\nWARNINGS (${summary.warnings.length}):`);
    for (const w of summary.warnings) console.log(`  ⚠ ${w}`);
  }

  // Field count summary
  if (summary.processed > 0) {
    const allFieldNames = { income: new Set(), balance_sheet: new Set(), cash_flow: new Set() };
    for (const ticker of tickers) {
      const fixturePath = path.join(OUT_DIR, `${ticker}.json`);
      if (!fs.existsSync(fixturePath)) continue;
      const fix = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
      for (const st of ['income', 'balance_sheet', 'cash_flow']) {
        const stmtData = fix.statements[st] || {};
        for (const yearData of Object.values(stmtData)) {
          for (const field of Object.keys(yearData)) {
            allFieldNames[st].add(field);
          }
        }
      }
    }
    console.log(`\nUNIQUE FIELD NAMES ACROSS ALL COMPANIES:`);
    console.log(`  Income Statement: ${allFieldNames.income.size}`);
    console.log(`  Balance Sheet:    ${allFieldNames.balance_sheet.size}`);
    console.log(`  Cash Flow:        ${allFieldNames.cash_flow.size}`);
    console.log(`  TOTAL:            ${allFieldNames.income.size + allFieldNames.balance_sheet.size + allFieldNames.cash_flow.size}`);
  }

  console.log(`\nFixtures written to: ${OUT_DIR}/`);
}

main();
