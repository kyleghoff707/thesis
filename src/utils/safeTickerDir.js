// Sanitize a ticker for use as a directory name across macOS, Linux, and Windows.
// Tickers are uppercased and stripped of anything other than [A-Z0-9._-].
// Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are suffixed with _.
// Leading dots are replaced (Unix would treat the dir as hidden).

const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function safeTickerDir(ticker) {
  if (typeof ticker !== 'string' || !ticker.trim()) {
    throw new Error('safeTickerDir: ticker must be a non-empty string');
  }
  let cleaned = ticker
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_');
  if (RESERVED.test(cleaned)) cleaned = `${cleaned}_`;
  return cleaned;
}
