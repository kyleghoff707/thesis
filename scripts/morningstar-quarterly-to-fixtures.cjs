/**
 * morningstar-quarterly-to-fixtures.cjs
 *
 * Reads Morningstar Quarterly CSVs from knowledge/morningstar-quarterly-financial-statements/{TICKER}/
 * Outputs JSON fixture files to src/engines/__tests__/fixtures/morningstar-quarterly/{TICKER}.json
 *
 * CSV format (confirmed across all 50 companies):
 *   Header:  TICKER_statement-type_Quarterly_Restated,Q2 2022,Q3 2022,...,Q1 2026[,TTM]
 *   Data:    field name,value1,...,valueN[,ttm_value]
 *   Values:  whole dollars with trailing decimal (365817000000.)
 *   Negatives: leading minus (-212981000000.)
 *   Empty:   ,, → null
 *   Dot only: . → 0
 *   Quoted:  "Selling, General and Administrative Expenses"
 *   Last row: "Fiscal year ends in {Month} {Day} | {Currency}"
 *   IS/CF:   quarters + TTM column.  BS: quarters only, no TTM.
 *   Bottom duplicate rows (EPS, WASO) — keep first occurrence only.
 *
 * Quarter labels: "Q1 2023", "Q2 2023", etc. (fiscal quarters)
 *
 * Usage:  node scripts/morningstar-quarterly-to-fixtures.cjs [TICKER]
 *   No args → process all 50 companies
 *   With ticker → process just that one
 */

const fs = require('fs');
const path = require('path');

const MS_DIR = path.join(__dirname, '..', 'knowledge', 'morningstar-quarterly-financial-statements');
const OUT_DIR = path.join(__dirname, '..', 'src', 'engines', '__tests__', 'fixtures', 'morningstar-quarterly');

const STATEMENT_TYPES = {
  'Income_Statement': 'income',
  'Balance_Sheet': 'balance_sheet',
  'Cash_Flow': 'cash_flow',
};

// ---------------------------------------------------------------------------
// CSV Parser — handles quoted fields, commas inside quotes, escaped quotes
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

function parseValue(raw) {
  const s = (raw || '').trim();
  if (s === '') return null;
  if (s === '.') return 0;
  // Remove trailing period (Morningstar format: "365817000000.")
  const cleaned = s.endsWith('.') && s.length > 1 ? s.slice(0, -1) : s;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Quarter Label Parser — "Q2 2022" → { quarter: 2, year: 2022, label: "Q2 2022" }
// ---------------------------------------------------------------------------

function parseQuarterLabel(label) {
  const trimmed = label.trim();
  if (trimmed === 'TTM') return { quarter: null, year: null, label: 'TTM' };
  const match = trimmed.match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]), label: trimmed };
}

// ---------------------------------------------------------------------------
// Statement Parser
// ---------------------------------------------------------------------------

function parseStatement(csvContent) {
  const rows = parseCSVRows(csvContent);
  if (rows.length < 2) return null;

  // Row 0 = header: TICKER_type_Quarterly_Restated, Q2 2022, ..., Q1 2026 [, TTM]
  const header = rows[0];
  const periodLabels = header.slice(1).map(y => y.trim());
  const hasTTM = periodLabels[periodLabels.length - 1] === 'TTM';
  const quarterLabels = hasTTM ? periodLabels.slice(0, -1) : [...periodLabels];

  // Parse all quarter labels
  const parsedQuarters = quarterLabels.map(parseQuarterLabel).filter(q => q !== null);

  // Parse fiscal year end + currency from last row
  let fiscalYearEnd = null;
  let currency = 'USD';
  const lastRowField = (rows[rows.length - 1][0] || '').trim();
  const fyMatch = lastRowField.match(/Fiscal year ends in (.+?)\s*\|\s*(\w+)/);
  if (fyMatch) {
    fiscalYearEnd = fyMatch[1].trim();
    currency = fyMatch[2].trim();
  }

  // Build quarter → { field: value } maps
  const data = {};
  for (const label of periodLabels) {
    data[label] = {};
  }

  const seenFields = new Set();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawField = row[0] || '';

    // Skip metadata rows
    if (rawField.match(/Fiscal year ends in/)) continue;

    // Strip leading whitespace (hierarchy indentation)
    const fieldName = rawField.replace(/^\s+/, '');
    if (!fieldName) continue;

    // Skip pure section headers (all values empty)
    const hasAnyValue = row.slice(1, periodLabels.length + 1).some(v => {
      const s = (v || '').trim();
      return s !== '' && s !== '.';
    });

    // Keep supplemental section rows that have data, skip empty headers
    if (!hasAnyValue) continue;

    // Deduplicate — keep first occurrence (bottom EPS/WASO rows are duplicates)
    if (seenFields.has(fieldName)) continue;
    seenFields.add(fieldName);

    // Parse values per period
    for (let j = 0; j < periodLabels.length; j++) {
      const period = periodLabels[j];
      const val = parseValue(row[j + 1]);
      if (val !== null) {
        data[period][fieldName] = val;
      }
    }
  }

  return { quarterLabels: parsedQuarters, hasTTM, data, fiscalYearEnd, currency };
}

// ---------------------------------------------------------------------------
// Company Processor
// ---------------------------------------------------------------------------

function processCompany(ticker, dir) {
  const files = fs.readdirSync(dir);

  const fixture = {
    ticker,
    source: 'morningstar-quarterly',
    currency: 'USD',
    fiscalYearEnd: null,
    statements: {},
  };

  const stats = {};

  for (const [filePattern, stmtType] of Object.entries(STATEMENT_TYPES)) {
    const file = files.find(f => f.includes(filePattern));
    if (!file) {
      console.warn(`  WARNING: Missing ${filePattern} for ${ticker}`);
      continue;
    }

    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const result = parseStatement(content);
    if (!result) {
      console.warn(`  WARNING: Failed to parse ${file}`);
      continue;
    }

    fixture.statements[stmtType] = result.data;

    if (result.fiscalYearEnd) {
      fixture.fiscalYearEnd = result.fiscalYearEnd;
    }
    if (result.currency !== 'USD') {
      fixture.currency = result.currency;
    }

    // Track stats per statement
    const firstQtr = result.quarterLabels[0]?.label;
    stats[stmtType] = {
      quarters: result.quarterLabels.length,
      hasTTM: result.hasTTM,
      fields: firstQtr ? Object.keys(result.data[firstQtr] || {}).length : 0,
    };
  }

  return { fixture, stats };
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

  // Check quarter label consistency across statements
  const incPeriods = Object.keys(fixture.statements.income || {}).filter(p => p !== 'TTM');
  const bsPeriods = Object.keys(fixture.statements.balance_sheet || {}).filter(p => p !== 'TTM');

  if (incPeriods.length > 0 && bsPeriods.length > 0) {
    // BS should not have more quarters than IS (BS may lack TTM but otherwise match)
    const incSet = new Set(incPeriods);
    for (const p of bsPeriods) {
      if (!incSet.has(p)) warnings.push(`BS period ${p} not in IS`);
    }
  }

  // Spot-check known quarterly values (AAPL Q1 2026 revenue)
  if (ticker === 'AAPL') {
    const rev = fixture.statements.income?.['Q1 2026']?.['Total Revenue'];
    if (rev !== 143756000000) {
      warnings.push(`AAPL Q1 2026 revenue: expected 143756000000, got ${rev}`);
    }
    const ta = fixture.statements.balance_sheet?.['Q1 2026']?.['Total Assets'];
    if (ta !== 379297000000) {
      warnings.push(`AAPL Q1 2026 total assets: expected 379297000000, got ${ta}`);
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

  let tickers;
  if (requestedTicker) {
    const dir = path.join(MS_DIR, requestedTicker);
    if (!fs.existsSync(dir)) {
      console.error(`No Morningstar quarterly data found for ${requestedTicker}`);
      process.exit(1);
    }
    tickers = [requestedTicker];
  } else {
    tickers = fs.readdirSync(MS_DIR)
      .filter(d => fs.statSync(path.join(MS_DIR, d)).isDirectory())
      .sort();
  }

  console.log(`\nMORNINGSTAR QUARTERLY CSV → JSON FIXTURE CONVERTER`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Processing ${tickers.length} companies...\n`);

  const summary = { processed: 0, errors: [], warnings: [] };
  const allStats = {};

  for (const ticker of tickers) {
    process.stdout.write(`  ${ticker.padEnd(8)}`);

    try {
      const { fixture, stats } = processCompany(ticker, path.join(MS_DIR, ticker));
      const warnings = validateFixture(ticker, fixture);

      // Stats line
      const parts = [];
      for (const [st, s] of Object.entries(stats)) {
        const label = st === 'income' ? 'IS' : st === 'balance_sheet' ? 'BS' : 'CF';
        parts.push(`${label}:${s.fields}f/${s.quarters}q`);
      }
      parts.push(`FY:${fixture.fiscalYearEnd || '?'}`);
      if (fixture.currency !== 'USD') parts.push(fixture.currency);
      if (warnings.length > 0) parts.push(`⚠ ${warnings.length} warning(s)`);

      console.log(parts.join('  '));

      if (warnings.length > 0) {
        for (const w of warnings) {
          summary.warnings.push(`${ticker}: ${w}`);
        }
      }

      // Write fixture
      const outPath = path.join(OUT_DIR, `${ticker}.json`);
      fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));

      allStats[ticker] = stats;
      summary.processed++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      summary.errors.push(`${ticker}: ${err.message}`);
    }
  }

  // Summary report
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

  // Field count summary across all companies
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

  // Quarter coverage summary
  if (summary.processed > 0) {
    const qtrCounts = Object.values(allStats).map(s => s.income?.quarters || 0);
    const minQ = Math.min(...qtrCounts);
    const maxQ = Math.max(...qtrCounts);
    console.log(`\nQUARTER COVERAGE: ${minQ}-${maxQ} quarters per company`);
  }

  console.log(`\nFixtures written to: ${OUT_DIR}/`);
}

main();
