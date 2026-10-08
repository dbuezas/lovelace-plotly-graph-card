import { tz, tzOffset } from "@date-fns/tz";
import { HomeAssistant } from "custom-card-helpers";
import { parseISO } from "date-fns";

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

/** Naive date string Plotly draws as-is, e.g. "2024-03-31 02:30:00.000" */
export function toPlotlyDateString(timestamp: number, timeZone: string) {
  // Faster than date-fns' format, which matters for long traces
  const offset = getOffset(timestamp, timeZone);
  const iso = new Date(timestamp + offset).toISOString();
  // "2024-03-31T02:30:00.000Z" -> "2024-03-31 02:30:00.000"
  if (iso.length === 24) return iso.slice(0, 10) + " " + iso.slice(11, 23);
  return iso.replace(/^\+/, "").replace("T", " ").slice(0, -1);
}

/**
 * Timestamp of a naive date string from Plotly, read as wall clock time in `timeZone`.
 * Known issue: with @date-fns/tz 1.5, a wall time that falls in a DST gap of
 * the browser's own timezone comes back shifted by the gap. Fix proposed in
 * https://github.com/date-fns/tz/pull/79
 */
export function parsePlotlyDateString(str: string, timeZone: string) {
  return +parseISO(str, { in: tz(timeZone) });
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
 * Converts what is handed to Plotly so it is drawn in `timeZone`: all Dates
 * in traces and layout, and numbers on date x axes (ranges, trace x values,
 * and the x of shapes and annotations).
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
  // Numbers on date axes are timestamps Plotly would draw in the browser's timezone
  const isDateAxis = (ref: any = "x") =>
    typeof ref === "string" &&
    /^x\d*$/.test(ref) &&
    layout["xaxis" + ref.slice(1)]?.type === "date";
  const convertNumber = (v: any) =>
    typeof v === "number" && isFinite(v) ? toPlotlyDateString(v, timeZone) : v;
  for (const shape of asArray(layout.shapes)) {
    if (!isDateAxis(shape?.xref)) continue;
    shape.x0 = convertNumber(shape.x0);
    shape.x1 = convertNumber(shape.x1);
  }
  for (const annotation of asArray(layout.annotations)) {
    if (isDateAxis(annotation?.xref))
      annotation.x = convertNumber(annotation.x);
  }
  const entities = parsed.entities.map((entity) => {
    const converted = convertDates(entity, timeZone);
    if (Array.isArray(converted?.x) && isDateAxis(converted.xaxis))
      converted.x = converted.x.map(convertNumber);
    return converted;
  });
  return { ...parsed, entities, layout };
}

const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);
