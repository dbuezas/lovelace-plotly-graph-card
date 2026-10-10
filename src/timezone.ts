import { tz, tzOffset } from "@date-fns/tz";
import { HomeAssistant } from "custom-card-helpers";

/**
 * Plotly has no timezone support: it draws JS Dates and numeric ranges in the
 * browser's timezone. When the card should show another timezone (e.g. Home
 * Assistant's "use server time zone" profile setting), dates are handed to
 * Plotly as naive "wall clock" strings in that timezone, which Plotly draws
 * as-is. Everything inside the card keeps working with real timestamps.
 *
 * A `timeZone` of `undefined` means "the browser's timezone" (no conversion).
 */
/** "local", "server" or an IANA name like "Europe/Rome" */
export type TimeZoneConfig = string;

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export function resolveTimeZone(
  time_zone: TimeZoneConfig | undefined,
  hass: HomeAssistant | undefined,
): string | undefined {
  // Home Assistant's profile setting ("local" | "server") is the default
  time_zone ??= (hass?.locale as any)?.time_zone;
  if (!time_zone || time_zone === "local") return undefined;
  const timeZone =
    time_zone === "server" ? (hass?.config as any)?.time_zone : time_zone;
  if (!timeZone || timeZone === browserTimeZone()) return undefined;
  if (isNaN(tzOffset(timeZone, new Date())))
    throw new Error(`time_zone: unknown timezone '${timeZone}'`);
  return timeZone;
}

/** date-fns context option computing in `timeZone` (the browser's if undefined) */
export const inTimeZone = (timeZone: string | undefined) =>
  timeZone ? { in: tz(timeZone) } : {};

const BUCKET = 60 * 60 * 1000;
let cached = { timeZone: "", start: NaN, offset: 0 };
/**
 * Offset of `timeZone` at `timestamp` in ms. tzOffset dominates rendering
 * time on long traces, so the offset of the last hour is reused
 * (traces are sorted, so most points share it). An hour is cached only when
 * its start and end agree, so transitions stay exact.
 */
function getOffset(timestamp: number, timeZone: string) {
  const start = Math.floor(timestamp / BUCKET) * BUCKET;
  if (cached.start === start && cached.timeZone === timeZone)
    return cached.offset;
  const offset = tzOffset(timeZone, new Date(start)) * 60 * 1000;
  const end = tzOffset(timeZone, new Date(start + BUCKET - 1)) * 60 * 1000;
  if (offset !== end)
    return tzOffset(timeZone, new Date(timestamp)) * 60 * 1000;
  cached = { timeZone, start, offset };
  return offset;
}

const MINUTE = 60 * 1000;
// "00." to "59." and "000" to "999": most points need no number formatting
const SECONDS = Array.from(
  { length: 60 },
  (_, i) => `${i}`.padStart(2, "0") + ".",
);
const MILLISECONDS = Array.from({ length: 1000 }, (_, i) =>
  `${i}`.padStart(3, "0"),
);
// Traces are sorted, so most points share the minute of the point before
let minute = { start: NaN, prefix: "" };

/** Naive date string Plotly draws as-is, e.g. "2024-03-31 02:30:00.000" */
export function toPlotlyDateString(timestamp: number, timeZone: string) {
  // Faster than date-fns' format, which matters for long traces.
  // Math.trunc drops fractions of a millisecond like Date does.
  const wallClock = Math.trunc(timestamp + getOffset(timestamp, timeZone));
  const start = Math.floor(wallClock / MINUTE) * MINUTE;
  if (minute.start !== start) {
    const iso = new Date(start).toISOString();
    // Years before 0 or after 9999 ("+010000-01-01T...")
    if (iso.length !== 24) {
      const full = new Date(wallClock).toISOString();
      return full.replace(/^\+/, "").replace("T", " ").slice(0, -1);
    }
    // "2024-03-31T02:30:00.000Z" -> "2024-03-31 02:30:"
    minute = { start, prefix: iso.slice(0, 10) + " " + iso.slice(11, 17) };
  }
  const rest = wallClock - start;
  return (
    minute.prefix + SECONDS[Math.floor(rest / 1000)] + MILLISECONDS[rest % 1000]
  );
}

function isPlainObject(value: any) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Deep copy replacing every Date with its wall clock string in `timeZone` */
function convertDates(value: any, timeZone: string): any {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return isNaN(timestamp) ? value : toPlotlyDateString(timestamp, timeZone);
  }
  if (Array.isArray(value)) {
    // Big data arrays are either all dates or none
    if (["number", "string", "boolean"].includes(typeof value[0])) return value;
    return value.map((v) => convertDates(v, timeZone));
  }
  if (isPlainObject(value)) {
    const copy = {};
    for (const key in value) copy[key] = convertDates(value[key], timeZone);
    return copy;
  }
  return value;
}

/**
 * Converts what is handed to Plotly so it is drawn in `timeZone`: all Dates
 * in traces and layout, and the numeric ranges of date x axes (the card's own
 * visible range). Other numbers are left alone: whether a number is a
 * timestamp depends on where it is (3D scenes, pixel-sized shapes...), so
 * times must be given as Dates.
 */
export function toPlotlyTimeZone<
  T extends { entities: any[]; layout: Record<string, any> },
>(parsed: T, timeZone: string | undefined): T {
  if (!timeZone) return parsed;
  const layout = convertDates(parsed.layout, timeZone);
  for (const key of Object.keys(layout)) {
    const axis = layout[key];
    if (!key.match(/^xaxis\d*$/) || axis?.type !== "date") continue;
    if (Array.isArray(axis.range)) {
      axis.range = axis.range.map((v: any) =>
        typeof v === "number" && isFinite(v)
          ? toPlotlyDateString(v, timeZone)
          : v,
      );
    }
  }
  return {
    ...parsed,
    entities: parsed.entities.map((entity) => convertDates(entity, timeZone)),
    layout,
  };
}
