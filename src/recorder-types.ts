// https://github.com/home-assistant/frontend/blob/dev/src/data/recorder.ts
import { keys } from "lodash";
import { parseTimeDuration, TimeDurationStr } from "./duration/duration";

export interface StatisticValue {
  statistic_id: string;
  start: string;
  end: string;
  last_reset: string | null;
  max: number | null;
  mean: number | null;
  min: number | null;
  sum: number | null;
  state: number | null;
}

export interface Statistics {
  [statisticId: string]: StatisticValue[];
}
export const STATISTIC_TYPES = ["state", "sum", "min", "max", "mean"] as const;
export type StatisticType = typeof STATISTIC_TYPES[number];

export const STATISTIC_PERIODS = [
  "5minute",
  "hour",
  "day",
  "week",
  "month",
] as const;
export type StatisticPeriod = typeof STATISTIC_PERIODS[number];
export type AutoPeriodConfig = Record<TimeDurationStr, StatisticPeriod>;

export function getIsAutoPeriodConfig(val: any): val is AutoPeriodConfig {
  const isObject =
    typeof val === "object" && val !== null && !Array.isArray(val);
  if (!isObject) return false;
  const entries = Object.entries(val);
  if (entries.length === 0) return false;
  return entries.every(([duration, period]) => {
    if (!STATISTIC_PERIODS.includes(period as any)) return false;
    try {
      parseTimeDuration(duration as any);
    } catch (e) {
      return false;
    }
    return true;
  });
}
