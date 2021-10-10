import { DateRange } from "./types";
import addMilliseconds from "date-fns/addMilliseconds";

const subtract_single_single = (
  [a_start, a_end]: DateRange,
  [b_start, b_end]: DateRange
): DateRange[] => {
  // no intersection
  if (a_end < b_start) return [[a_start, a_end]];
  if (b_end < a_start) return [[a_start, a_end]];
  // a contains b
  if (a_start < b_start && b_end < a_end)
    return [
      [a_start, b_start],
      [b_end, a_end],
    ];
  // b contains a
  if (b_start <= a_start && a_end <= b_end) return [];
  // remove left
  if (b_start <= a_start && a_start <= b_end && b_end < a_end)
    return [[addMilliseconds(b_end, 1), a_end]];
  // remove right
  if (a_start < b_start && b_start <= a_end && a_end <= b_end)
    return [[a_start, addMilliseconds(b_start, -1)]];
  else {
    console.log("---------");
    console.log([a_start, a_end]);
    console.log([b_start, b_end]);
    throw new Error(
      "Error computing range subtraction. Please report an issue in the repo of this card."
    );
  }
};

const subtract_many_single = (as: DateRange[], b: DateRange) =>
  as.flatMap((a) => subtract_single_single(a, b));

export const subtractRanges = (as: DateRange[], bs: DateRange[]) =>
  bs.reduce((acc, curr) => subtract_many_single(acc, curr), as);

export const compactRanges = (ranges: DateRange[]) =>
  ranges
    .slice()
    .sort((a, b) => a[0].getTime() - b[0].getTime())
    .reduce((acc, next) => {
      if (acc.length === 0) return [next];
      const prev = acc[acc.length - 1];
      if (prev[1] >= next[0]) {
        const merged: DateRange = [prev[0], next[1]];
        return [...acc.slice(0, -1), merged];
      }
      return [...acc, next];
    }, [] as DateRange[]);
