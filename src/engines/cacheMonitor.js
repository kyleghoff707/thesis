// Cache Monitor — Tracks prompt cache hit rates during pipeline execution
// Monitors cache_read vs uncached input tokens to detect cache effectiveness.
// Warns when hit rate falls below 70% threshold (indicates cache_control issues).
//
// This is measurement infrastructure, not enforcement — it never blocks execution.

const CACHE_HIT_THRESHOLD = 0.70;

// Factory: create a cache monitor that tracks cache read/write/miss stats
// record() accepts usage objects from dispatchAgent results
// getSummary() returns aggregate stats with hit rate calculation
export function createCacheMonitor() {
  const entries = [];

  return {
    record(usage) {
      if (!usage) return;
      entries.push({
        cacheRead: usage.cacheRead || 0,
        cacheWrite: usage.cacheWrite || 0,
        inputTokens: usage.inputTokens || 0,
      });
    },

    getSummary() {
      let totalRead = 0;
      let totalWrite = 0;
      let totalInput = 0;

      for (const entry of entries) {
        totalRead += entry.cacheRead;
        totalWrite += entry.cacheWrite;
        totalInput += entry.inputTokens;
      }

      // Uncached = total input - cache reads (cache reads are a subset of input)
      const totalUncached = Math.max(0, totalInput - totalRead);

      // Hit rate = cache reads / total input tokens (when input > 0)
      const hitRate = totalInput > 0 ? totalRead / totalInput : 0;
      const hitRatePct = `${(hitRate * 100).toFixed(1)}%`;
      const belowThreshold = hitRate < CACHE_HIT_THRESHOLD;

      return {
        entries: entries.length,
        totalRead,
        totalWrite,
        totalUncached,
        hitRate,
        hitRatePct,
        belowThreshold,
      };
    },
  };
}

export const _testExports = { CACHE_HIT_THRESHOLD };
