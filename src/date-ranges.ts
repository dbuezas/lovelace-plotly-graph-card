import { json } from "stream/consumers";
import { TimestampRange } from "./types";

const subtract_single_single = (
  [a_start, a_end]: TimestampRange,
  [b_start, b_end]: TimestampRange
): TimestampRange[] => {
  // no intersection
  if (a_end < b_start) return [[a_start, a_end]];
  if (b_end < a_start) return [[a_start, a_end]];
  // a contains b
  if (a_start < b_start && b_end < a_end)
    return [
      [a_start, b_start - 1],
      [b_end + 1, a_end],
    ];
  // b contains a
  if (b_start <= a_start && a_end <= b_end) return [];
  // remove left
  if (b_start <= a_start && a_start <= b_end && b_end < a_end)
    return [[b_end + 1, a_end]];
  // remove right
  if (a_start < b_start && b_start <= a_end && a_end <= b_end)
    return [[a_start, b_start - 1]];
  else {
    throw new Error(
      `Error computing range subtraction. Please report an issue in the repo of this card and share this:`+
      JSON.stringify([a_start, a_end]) +
      JSON.stringify([b_start, b_end])
    );
  }
};

const subtract_many_single = (as: TimestampRange[], b: TimestampRange) =>
  as.flatMap((a) => subtract_single_single(a, b));

export const subtractRanges = (as: TimestampRange[], bs: TimestampRange[]) =>
  bs.reduce((acc, curr) => subtract_many_single(acc, curr), as);

export const compactRanges = (ranges: TimestampRange[]) =>
  ranges
    .slice()
    .sort((a, b) => a[0] - b[0])
    .reduce((acc, next) => {
      if (acc.length === 0) return [next];
      const prev = acc[acc.length - 1];
      if (prev[1] + 1 >= next[0]) {
        const merged: TimestampRange = [prev[0], next[1]];
        return [...acc.slice(0, -1), merged];
      }
      return [...acc, next];
    }, [] as TimestampRange[]);
