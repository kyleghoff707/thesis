// Cache Monitor — Cache hit/miss tracking for prompt caching (API-06)
// Tracks cache_read_input_tokens and cache_creation_input_tokens per API response.
// Warns if hit rate falls below 70% after 2+ agent dispatches.
// This is measurement infrastructure — it never blocks execution.

export function createCacheMonitor() {
  const entries = [];

  return {
    record(usage) {
      entries.push({
        cacheRead: usage.cacheRead || 0,
        cacheWrite: usage.cacheWrite || 0,
        uncached: usage.inputTokens || 0,
      });
    },

    getSummary() {
      const totalRead = entries.reduce((s, e) => s + e.cacheRead, 0);
      const totalWrite = entries.reduce((s, e) => s + e.cacheWrite, 0);
      const totalUncached = entries.reduce((s, e) => s + e.uncached, 0);
      const totalCacheable = totalRead + totalWrite;
      const hitRate = totalCacheable > 0 ? totalRead / totalCacheable : 0;
      const belowThreshold = hitRate < 0.70 && entries.length > 1;

      return {
        entries: entries.length,
        totalRead,
        totalWrite,
        totalUncached,
        hitRate,
        hitRatePct: `${(hitRate * 100).toFixed(1)}%`,
        belowThreshold,
      };
    },
  };
}

export const _testExports = {};
