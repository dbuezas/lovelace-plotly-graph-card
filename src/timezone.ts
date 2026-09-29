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
export type TimeZoneConfig = "local" | "server" | string;

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export function resolveTimeZone(
  time_zone: TimeZoneConfig | undefined,
  hass: HomeAssistant | undefined
): string | undefined {
  // Home Assistant's profile setting ("local" | "server") is the default
  time_zone ??= (hass?.locale as any)?.time_zone;
  if (!time_zone || time_zone === "local") return undefined;
  const tz =
    time_zone === "server" ? (hass?.config as any)?.time_zone : time_zone;
  if (!tz || tz === browserTimeZone()) return undefined;
  try {
    getFormatter(tz);
  } catch {
    throw new Error(`time_zone: unknown timezone '${tz}'`);
  }
  return tz;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function getFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

// Offsets only change on transitions, which happen on 15 minute boundaries.
const OFFSET_BUCKET = 15 * 60 * 1000;
const offsets = new Map<string, number>();
/** ms to add to a timestamp to get its wall clock time in `timeZone`, as UTC */
function getOffset(timestamp: number, timeZone: string) {
  const bucket = Math.floor(timestamp / OFFSET_BUCKET) * OFFSET_BUCKET;
  const key = timeZone + bucket;
  let offset = offsets.get(key);
  if (offset === undefined) {
    const parts: Record<string, string> = {};
    for (const { type, value } of getFormatter(timeZone).formatToParts(bucket))
      parts[type] = value;
    let year = +parts.year;
    if (parts.era === "BC" || parts.era === "B") year = 1 - year;
    const wall = new Date(0);
    wall.setUTCFullYear(year, +parts.month - 1, +parts.day);
    wall.setUTCHours(+parts.hour, +parts.minute, +parts.second);
    offset = +wall - bucket;
    if (offsets.size > 10000) offsets.clear();
    offsets.set(key, offset);
  }
  return offset;
}

/** Timestamp -> wall clock time in `timeZone`, expressed as UTC ms */
export function toWallTime(timestamp: number, timeZone: string) {
  return timestamp + getOffset(timestamp, timeZone);
}

/** Wall clock time in `timeZone` (as UTC ms) -> timestamp */
export function fromWallTime(wall: number, timeZone: string) {
  let timestamp = wall - getOffset(wall, timeZone);
  // A second pass settles the offset near DST transitions
  timestamp = wall - getOffset(timestamp, timeZone);
  return timestamp;
}

/** Wall clock time of a timestamp in the browser's timezone, as UTC ms */
export function toBrowserWallTime(timestamp: number) {
  const d = new Date(timestamp);
  const wall = new Date(0);
  wall.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate());
  wall.setUTCHours(
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  );
  return +wall;
}

/** Browser-local Date with the given wall clock time (as UTC ms) */
function fromBrowserWallTime(wall: number) {
  const w = new Date(wall);
  const d = new Date(0);
  d.setFullYear(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
  d.setHours(
    w.getUTCHours(),
    w.getUTCMinutes(),
    w.getUTCSeconds(),
    w.getUTCMilliseconds()
  );
  return d;
}

/**
 * Applies a browser-local date function (e.g. date-fns' startOfDay) as if the
 * browser was in `timeZone`.
 */
export function inTimeZone(
  timestamp: number,
  timeZone: string | undefined,
  fn: (date: Date) => Date | number
): number {
  if (!timeZone) return +fn(new Date(timestamp));
  const local = fromBrowserWallTime(toWallTime(timestamp, timeZone));
  const result = +fn(local);
  return fromWallTime(toBrowserWallTime(result), timeZone);
}

/** Naive date string Plotly draws as-is, e.g. "2024-03-31 02:30:00.000" */
export function toPlotlyDateString(timestamp: number, timeZone: string) {
  const iso = new Date(toWallTime(timestamp, timeZone)).toISOString();
  return iso.replace(/^\+/, "").replace("T", " ").slice(0, -1);
}

function isPlainObject(value: any) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Deep copy replacing every Date with its wall clock string in `timeZone` */
function convertDates(value: any, timeZone: string): any {
  if (value instanceof Date) {
    return isNaN(+value) ? value : toPlotlyDateString(+value, timeZone);
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
 * Converts what is handed to Plotly so it is drawn in `timeZone`:
 * all Dates in traces and layout, and numeric ranges of date x axes.
 */
export function toPlotlyTimeZone<
  T extends { entities: any[]; layout: Record<string, any> }
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
          : v
      );
    }
  }
  return {
    ...parsed,
    entities: parsed.entities.map((entity) => convertDates(entity, timeZone)),
    layout,
  };
}
