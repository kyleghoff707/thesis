// Ticker search — searches EDGAR ticker map locally
// Supports both ticker symbols and company names

import { searchEdgarTickers } from './edgar';

export async function searchTickers(query, limit = 8) {
  return searchEdgarTickers(query, limit);
}
