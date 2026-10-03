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

/** Naive date string Plotly draws as-is, e.g. "2024-03-31 02:30:00.000" */
export function toPlotlyDateString(timestamp: number, timeZone: string) {
  // Faster than date-fns' format, which matters for long traces
  const offset = tzOffset(timeZone, new Date(timestamp)) * 60 * 1000;
  const iso = new Date(timestamp + offset).toISOString();
  return iso.replace(/^\+/, "").replace("T", " ").slice(0, -1);
}

/** Timestamp of a naive date string from Plotly, read as wall clock time in `timeZone` */
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
 * Converts what is handed to Plotly so it is drawn in `timeZone`:
 * all Dates in traces and layout, and numeric ranges of date x axes.
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
