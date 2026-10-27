/**
 * Small, dependency-free statistics helpers. All functions are pure and
 * return null instead of NaN when the answer is undefined.
 */

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Sample standard deviation (n - 1).
function standardDeviation(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

function round(value, places = 2) {
  if (value === null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Least-squares slope of y against x, i.e. change in y per unit of x.
function slope(points) {
  if (points.length < 2) return null;
  const meanX = mean(points.map((p) => p.x));
  const meanY = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const { x, y } of points) {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * Pearson correlation coefficient of paired samples, in [-1, 1].
 * Null with fewer than 2 pairs, or when either side never varies (the
 * coefficient is undefined then, not zero).
 */
function pearson(points) {
  if (points.length < 2) return null;
  const meanX = mean(points.map((p) => p.x));
  const meanY = mean(points.map((p) => p.y));
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (const { x, y } of points) {
    cov += (x - meanX) * (y - meanY);
    varX += (x - meanX) ** 2;
    varY += (y - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return null;
  // Clamp floating-point drift just outside [-1, 1].
  return Math.max(-1, Math.min(1, cov / Math.sqrt(varX * varY)));
}

module.exports = { mean, standardDeviation, round, slope, pearson };
