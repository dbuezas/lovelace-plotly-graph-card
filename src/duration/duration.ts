import { HomeAssistant } from "custom-card-helpers";
import {
  endOfDay,
  endOfHour,
  endOfMinute,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  setDefaultOptions,
  startOfDay,
  startOfHour,
  startOfMinute,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";

export const timeUnits = {
  ms: 1,
  s: 1000,
  m: 1000 * 60,
  h: 1000 * 60 * 60,
  d: 1000 * 60 * 60 * 24,
  w: 1000 * 60 * 60 * 24 * 7,
  M: 1000 * 60 * 60 * 24 * 30,
  y: 1000 * 60 * 60 * 24 * 365,
};
type TimeUnit = keyof typeof timeUnits;
export type TimeDurationStr = `${number}${TimeUnit}` | `0`;

/**
 *
 * @param str 1.5s, -2m, 1h, 1d, 1w, 1M, 1.5y
 * @returns duration in milliseconds
 */
export const parseTimeDuration = (str: TimeDurationStr | undefined): number => {
  if (str === "0") return 0;
  if (!str || !str.match)
    throw new Error(`Cannot parse "${str}" as a duration`);
  const match = str.match(
    /^(?<sign>[+-])?(?<number>\d*(\.\d)?)(?<unit>(ms|s|m|h|d|w|M|y))$/,
  );
  if (!match || !match.groups)
    throw new Error(`Cannot parse "${str}" as a duration`);
  const g = match.groups;
  const sign = g.sign === "-" ? -1 : 1;
  const number = parseFloat(g.number);
  if (Number.isNaN(number))
    throw new Error(`Cannot parse "${str}" as a duration`);
  const unit = timeUnits[g.unit as TimeUnit];
  if (unit === undefined)
    throw new Error(`Cannot parse "${str}" as a duration`);

  return sign * number * unit;
};

export const isTimeDuration = (str: any) => {
  try {
    parseTimeDuration(str);
    return true;
  } catch (e) {
    return false;
  }
};

export const setDateFnDefaultOptions = (hass: HomeAssistant) => {
  const first_weekday: "sunday" | "saturday" | "monday" | "language" = (
    hass.locale as any
  ).first_weekday;
  const weekStartsOn = (
    {
      language: undefined,
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    } as const
  )[first_weekday];

  setDefaultOptions({
    locale: { code: hass.locale.language },
    weekStartsOn,
  });
};
export type RelativeTimeStr =
  | "current_minute"
  | "current_hour"
  | "current_day"
  | "current_week"
  | "current_month"
  | "current_quarter"
  | "current_year";

export const parseRelativeTime = (str: RelativeTimeStr): [number, number] => {
  const now = new Date();
  switch (str) {
    case "current_minute":
      return [+startOfMinute(now), +endOfMinute(now)];
    case "current_hour":
      return [+startOfHour(now), +endOfHour(now)];
    case "current_day":
      return [+startOfDay(now), +endOfDay(now)];
    case "current_week":
      return [+startOfWeek(now), +endOfWeek(now)];
    case "current_month":
      return [+startOfMonth(now), +endOfMonth(now)];
    case "current_quarter":
      return [+startOfQuarter(now), +endOfQuarter(now)];
    case "current_year":
      return [+startOfYear(now), +endOfYear(now)];
  }
  throw new Error(`${str} is not a dynamic relative time`);
};

export const isRelativeTime = (str: any) => {
  try {
    parseRelativeTime(str);
    return true;
  } catch (e) {
    return false;
  }
};
