// Node.js Finviz direct fetch — replaces Vite middleware /api/finviz/:ticker
// Used by nodeAdapter.js fetch interceptor when running in Node.js.
// Fetches Finviz quote page directly and parses with cheerio.

/**
 * Fetch and parse Finviz snapshot data for a single ticker.
 * Direct replacement for Vite middleware /api/finviz/:ticker.
 * Returns the same key-value object as the middleware.
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<object>} Parsed snapshot data (camelCase keys)
 */
export async function finvizData(ticker) {
  const { load } = await import('cheerio');

  const resp = await fetch(
    `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker.toUpperCase())}&p=d`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
  );

  if (!resp.ok) {
    throw new Error(`Finviz returned ${resp.status}`);
  }

  const html = await resp.text();
  const $ = load(html);

  // Parse the snapshot table: alternating label/value cells in each row
  // Matches the exact pattern from finvizPlugin in vite.config.js
  const data = {};
  const rows = $('table.snapshot-table2 tr');
  rows.each((_, row) => {
    const cells = $(row).find('> td');
    let lastKey = '';
    cells.each((j, cell) => {
      const text = $(cell).text().trim();
      if (j % 2 === 0) {
        // Label cell — convert to camelCase key
        lastKey = text
          .replace(/[%()]/g, '')
          .replace(/\s*\/\s*/g, ' ')
          .trim()
          .split(/\s+/)
          .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('');
      } else if (lastKey) {
        // Value cell — parse numbers, strip %, commas
        const clean = text.replace(/,/g, '').replace(/%$/, '');
        const num = parseFloat(clean);
        data[lastKey] = isNaN(num) ? text : num;
      }
    });
  });

  return data;
}
