import type { YValue } from "../types";

const numeric = (value: YValue) =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value));

/** Select original points, keeping extrema in input order and gaps intact. */
export function minMaxIndices(
  xs: (Date | number)[],
  ys: YValue[],
  maxPoints: number,
  visibleRange?: unknown,
): number[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 4) {
    throw new Error("min_max must be an integer of at least 4");
  }
  let start = 0;
  let end = xs.length;
  if (
    xs[0] instanceof Date &&
    Array.isArray(visibleRange) &&
    visibleRange.length === 2 &&
    visibleRange.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    while (start < end && Number(xs[start]) < visibleRange[0]) start++;
    while (end > start && Number(xs[end - 1]) > visibleRange[1]) end--;
    // Retain neighbours so lines still reach the edges of the viewport.
    start = Math.max(0, start - 1);
    end = Math.min(xs.length, end + 1);
  }
  const length = end - start;
  if (length <= maxPoints) {
    return Array.from({ length }, (_, i) => start + i);
  }

  const kept = new Set([start, end - 1]);
  const bucketSize = Math.ceil((length - 2) / Math.floor((maxPoints - 2) / 2));
  for (let first = start + 1; first < end - 1; first += bucketSize) {
    let min = -1;
    let max = -1;
    const last = Math.min(first + bucketSize, end - 1);
    for (let i = first; i < last; i++) {
      if (!numeric(ys[i])) {
        // Keep the edges of each missing run, not every missing sample.
        if (i === start + 1 || numeric(ys[i - 1])) {
          kept.add(i - 1);
          kept.add(i);
        }
        if (i === end - 2 || numeric(ys[i + 1])) {
          kept.add(i);
          kept.add(i + 1);
        }
        continue;
      }
      if (min === -1 || Number(ys[i]) < Number(ys[min])) min = i;
      if (max === -1 || Number(ys[i]) > Number(ys[max])) max = i;
    }
    if (min !== -1) kept.add(min);
    if (max !== -1) kept.add(max);
  }
  return [...kept].sort((a, b) => a - b);
}
