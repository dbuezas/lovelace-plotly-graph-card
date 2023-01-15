import { getIsPureObject } from "../utils";
import {
  AutoPeriodConfig,
  StatisticPeriod,
  StatisticType,
  STATISTIC_PERIODS,
  STATISTIC_TYPES,
} from "../recorder-types";

import { parseTimeDuration } from "../duration/duration";

function getIsAutoPeriodConfig(periodObj: any): periodObj is AutoPeriodConfig {
  if (!getIsPureObject(periodObj)) return false;
  let lastDuration = -1;
  for (const durationStr in periodObj) {
    const period = periodObj[durationStr];
    const duration = parseTimeDuration(durationStr as any); // will throw if not a valud duration
    if (!STATISTIC_PERIODS.includes(period as any)) {
      throw new Error(
        `Error parsing automatic period config: "${period}" not expected. Must be ${STATISTIC_PERIODS}`
      );
    }
    if (duration <= lastDuration) {
      throw new Error(
        `Error parsing automatic period config: ranges must be sorted in ascending order, "${durationStr}" not expected`
      );
    }
    lastDuration = duration;
  }
  return true;
}
export function parseStatistics(
  visible_range: number[],
  statistic?: StatisticType,
  period?: StatisticPeriod | "auto" | AutoPeriodConfig
) {
  if (!statistic && !period) return {};
  statistic ??= "mean";
  period ??= "hour";
  if (period === "auto") {
    period = {
      "0": "5minute",
      "1d": "hour",
      "7d": "day",
      "28d": "week",
      "12M": "month",
    };
  }
  if (getIsAutoPeriodConfig(period)) {
    const autoPeriod = period;
    period = "5minute";
    const timeSpan = visible_range[1] - visible_range[0];
    const mapping = Object.entries(autoPeriod).map(
      ([duration, period]) =>
        [parseTimeDuration(duration as any), period] as [
          number,
          StatisticPeriod
        ]
    );

    for (const [fromMS, aPeriod] of mapping) {
      /*
          the durations are validated to be sorted in ascendinig order
          when the config is parsed
        */
      if (timeSpan >= fromMS) period = aPeriod;
    }
    // TODO: this.parsed_config.layout = merge(this.parsed_config.layout, {
    //   xaxis: { title: `Period: ${entity.period}` },
    // });
  }
  if (!STATISTIC_TYPES.includes(statistic))
    throw new Error(
      `statistic: "${statistic}" is not valid. Use ${STATISTIC_TYPES}`
    );
  if (!STATISTIC_PERIODS.includes(period))
    throw new Error(
      `period: "${period}" is not valid. Use ${STATISTIC_PERIODS}`
    );
  return { statistic, period };
}
