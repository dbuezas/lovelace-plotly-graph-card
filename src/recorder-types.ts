// https://github.com/home-assistant/frontend/blob/dev/src/data/recorder.ts
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
