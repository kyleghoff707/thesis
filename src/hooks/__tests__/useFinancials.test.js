// Regression tests for useFinancials selector. The hook itself requires a
// React runtime to exercise, so we test the pure selector that owns the
// stale-filtering behavior.
//
// Bug context: a user searched TSCO, then NKE. The NKE OnePager rendered
// with companyName="Tractor Supply Co". Root cause was useFinancials
// returning the previous ticker's company data on the first render after
// a ticker transition — the caller's self-heal effect then wrote that stale
// name into the new ticker's report. See commit that introduced
// selectCompanyForTicker for the full flow.

import { describe, it, expect } from 'vitest';
import { selectCompanyForTicker } from '../useFinancials';

describe('selectCompanyForTicker (useFinancials stale filter)', () => {
  it('returns company when fetchedTicker matches current ticker', () => {
    const state = {
      company: { name: 'NIKE, Inc.' },
      loading: false,
      error: null,
      fetchedTicker: 'NKE',
    };
    const result = selectCompanyForTicker(state, 'NKE');
    expect(result.company).toEqual({ name: 'NIKE, Inc.' });
    expect(result.loading).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns null company when fetchedTicker is for a previous ticker', () => {
    // Regression: the first render after a TSCO→NKE transition still holds
    // TSCO's company data in state. The selector must NOT leak it.
    const state = {
      company: { name: 'Tractor Supply Company' },
      loading: false,
      error: null,
      fetchedTicker: 'TSCO',
    };
    const result = selectCompanyForTicker(state, 'NKE');
    expect(result.company).toBeNull();
    expect(result.loading).toBe(true); // forces callers to wait for the new fetch
  });

  it('returns null company on the initial render before any fetch has completed', () => {
    const state = { company: null, loading: false, error: null, fetchedTicker: null };
    const result = selectCompanyForTicker(state, 'NKE');
    expect(result.company).toBeNull();
    expect(result.loading).toBe(true);
  });

  it('preserves loading=true when the fetch is in flight for the current ticker', () => {
    const state = {
      company: null,
      loading: true,
      error: null,
      fetchedTicker: null,
    };
    const result = selectCompanyForTicker(state, 'NKE');
    expect(result.loading).toBe(true);
  });

  it('passes through error for the current ticker', () => {
    const state = {
      company: null,
      loading: false,
      error: 'network error',
      fetchedTicker: 'NKE',
    };
    const result = selectCompanyForTicker(state, 'NKE');
    expect(result.error).toBe('network error');
  });
});
