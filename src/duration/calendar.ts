import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { inTimeZone } from "../timezone";
import type { TimeDurationStr } from "./duration";

export function calendarInterval(interval: TimeDurationStr, timeZone?: string) {
  let unit = interval.slice(-1);
  let count = Number(interval.slice(0, -1));
  if (
    !Number.isInteger(count) ||
    count <= 0 ||
    !["d", "w", "M", "y"].includes(unit)
  )
    return undefined;
  // Whole years are groups of twelve months starting on January 1st.
  if (unit === "y") {
    unit = "M";
    count *= 12;
  }

  const options = inTimeZone(timeZone);
  const startOf =
    unit === "w" ? startOfWeek : unit === "M" ? startOfMonth : startOfDay;
  // Stable calendar anchors keep separate series and refreshes aligned.
  // startOfWeek uses the HA first-weekday setting configured by the card.
  const anchor =
    unit === "w"
      ? startOfWeek(parseISO("1970-01-05", options), options)
      : parseISO("1970-01-01", options);
  const index = (x: number) =>
    Math.floor(
      (unit === "M"
        ? differenceInCalendarMonths(x, anchor, options)
        : differenceInCalendarDays(x, anchor, options) /
          (unit === "w" ? 7 : 1)) / count,
    );
  const boundary = (i: number) =>
    startOfDay(
      unit === "M"
        ? addMonths(anchor, i * count, options)
        : addDays(anchor, i * count * (unit === "w" ? 7 : 1), options),
      options,
    ).getTime();

  return {
    floor(x: number) {
      if (count === 1) return startOf(x, options).getTime();
      let i = index(x);
      let timestamp = boundary(i);
      while (timestamp > x) timestamp = boundary(--i);
      return timestamp;
    },
    next(x: number) {
      let i = index(x);
      let timestamp: number;
      // A timezone can skip a whole date; never emit the same instant twice.
      do {
        timestamp = boundary(++i);
      } while (timestamp <= x);
      return timestamp;
    },
  };
}
