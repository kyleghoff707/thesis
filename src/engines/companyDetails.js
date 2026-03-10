// Company details — fetched from EDGAR submissions endpoint
// Provides name, SIC code/description, exchange, etc.

import { fetchCompanyInfo } from './edgar';

export async function fetchCompanyDetails(ticker) {
  return fetchCompanyInfo(ticker);
}
