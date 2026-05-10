// Coefficient-of-variation -> 0-100 consistency score
// CV = stdev(series) / |mean(series)|
// Score: 0 CV -> 100, 0.3 CV -> 50, >=0.6 CV -> 0 (linear interpolation, clamped)

export function coefficientOfVariation(series) {
  const vals = series.filter(v => v != null && Number.isFinite(v));
  if (vals.length < 3) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
  const stdev = Math.sqrt(variance);

  const denom = Math.abs(mean);
  if (denom === 0) return stdev === 0 ? 0 : null;
  const cv = stdev / denom;
  return cv < 1e-10 ? 0 : cv;
}

export function consistencyScore(cv) {
  if (cv == null) return null;
  if (cv <= 0) return 100;
  if (cv >= 0.6) return 0;
  return Math.round(100 * (1 - cv / 0.6));
}
