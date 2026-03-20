#!/usr/bin/env node
/**
 * Batch convert .xls/.xlsx files to .csv
 * Usage: node scripts/xls-to-csv.js <input-folder> [output-folder]
 *
 * If output-folder is omitted, CSVs are written next to the originals.
 * Each sheet in the workbook becomes a separate CSV: filename_SheetName.csv
 * If a workbook has only one sheet, the CSV is just: filename.csv
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const inputDir = process.argv[2];
const outputDir = process.argv[3] || inputDir;

if (!inputDir) {
  console.error('Usage: node scripts/xls-to-csv.js <input-folder> [output-folder]');
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Input folder not found: ${inputDir}`);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const files = fs.readdirSync(inputDir).filter(f => /\.xlsx?$/i.test(f));
console.log(`Found ${files.length} Excel files in ${inputDir}\n`);

let converted = 0;
for (const file of files) {
  const filePath = path.join(inputDir, file);
  const baseName = file.replace(/\.xlsx?$/i, '');

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);

      const csvName = sheetNames.length === 1
        ? `${baseName}.csv`
        : `${baseName}_${sheetName.replace(/[\/\\?%*:|"<>]/g, '_')}.csv`;

      const csvPath = path.join(outputDir, csvName);
      fs.writeFileSync(csvPath, csv);
      console.log(`  ${file} -> ${csvName} (${sheetNames.length > 1 ? sheetName + ', ' : ''}${csv.split('\n').length} rows)`);
      converted++;
    }
    fs.unlinkSync(filePath);
    console.log(`  [deleted] ${file}`);
  } catch (err) {
    console.error(`  ERROR: ${file} -> ${err.message}`);
  }
}

console.log(`\nDone: ${converted} CSVs from ${files.length} Excel files`);
