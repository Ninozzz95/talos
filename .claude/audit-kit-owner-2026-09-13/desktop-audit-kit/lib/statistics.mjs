/** Exact descriptive quantiles (linear interpolation / type 7). Never invent missing data. */
export function summarize(values) {
  if (!Array.isArray(values) || values.some(x => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new TypeError('Expected an array of finite numbers');
  }
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return {n: 0, min: null, median: null, p95: null, p99: null, max: null};
  const q = p => {
    const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return {n: v.length, min: v[0], median: q(.5), p95: q(.95), p99: q(.99), max: v.at(-1)};
}
