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

export interface StatisticsMetaData {
  statistics_unit_of_measurement: string | null;
  statistic_id: string;
  source: string;
  name?: string | null;
  has_sum: boolean;
  has_mean: boolean;
  unit_class: string | null;
}
export interface Statistics {
  [statisticId: string]: StatisticValue[];
}
export type StatisticType = "state" | "sum" | "min" | "max" | "mean";

export type StatisticPeriod = "5minute" | "hour" | "day" | "month";
