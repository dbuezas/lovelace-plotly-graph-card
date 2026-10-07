import type { StatisticPeriod } from "../recorder-types";
import type { TimestampRange } from "../types";

export type StatisticsUpdatePeriod = "5minute" | "hour";

export function getStatisticsUpdatePeriod(
  period: StatisticPeriod,
): StatisticsUpdatePeriod {
  return period === "5minute" ? "5minute" : "hour";
}

// Calendar aggregates are built from hourly rows. These are compilation
// intervals, not calendar boundaries; HA still handles its own time zone.
export function isLiveStatisticsRange(
  range: TimestampRange,
  period: StatisticPeriod,
  now: number,
) {
  const interval = period === "5minute" ? 300000 : 3600000;
  return range[0] <= now && range[1] >= Math.floor(now / interval) * interval;
}
