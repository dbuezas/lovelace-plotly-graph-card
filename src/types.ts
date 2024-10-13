import {
  ColorSchemeArray,
  ColorSchemeNames,
} from "./parse-config/parse-color-scheme";

import { RelativeTimeStr, TimeDurationStr } from "./duration/duration";
import {
  AutoPeriodConfig,
  StatisticPeriod,
  StatisticType,
  StatisticValue,
} from "./recorder-types";

import { HassEntity } from "home-assistant-js-websocket";
import { FilterFn, FilterInput } from "./filters/filters";
import type filters from "./filters/filters";
import internal from "stream";

export { HassEntity } from "home-assistant-js-websocket";

export type YValue = number | string | null;

export type InputConfig = {
  type: "custom:plotly-graph";
  /**
   * The time to show on load.
   * It can be the number of hour (e.g 12),
   * a duration string, e.g 100ms, 10s, 30.5m, 2h, 7d, 2w, 1M, 1y,
   * or relative time, i.e:
   *  * current_minute
   *  * current_hour
   *  * current_day
   *  * current_week
   *  * current_month
   *  * current_quarter
   *  * current_year
   */
  hours_to_show?: number | TimeDurationStr | RelativeTimeStr;
  /** Either a number (seconds), or "auto" */
  refresh_interval?: number | "auto"; // in seconds
  color_scheme?: ColorSchemeNames | ColorSchemeArray | number;
  title?: string;
  offset?: TimeDurationStr;
  entities: ({
    entity?: string;
    name?: string;
    attribute?: string;
    statistic?: StatisticType;
    period?: StatisticPeriod | "auto" | AutoPeriodConfig;
    unit_of_measurement?: string;
    internal?: boolean;
    show_value?:
      | boolean
      | {
          right_margin: number;
        };
    offset?: TimeDurationStr;
    extend_to_present?: boolean;
    filters?: FilterInput[];
    on_legend_click?: Function;
    on_legend_dblclick?: Function;
    on_click?: Function;
  } & Partial<Plotly.PlotData>)[];
  defaults?: {
    entity?: Partial<Plotly.PlotData>;
    yaxes?: Partial<Plotly.Layout["yaxis"]>;
  };
  on_dblclick?: Function;
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  ha_theme?: boolean;
  raw_plotly_config?: boolean;
  significant_changes_only?: boolean; // defaults to false
  minimal_response?: boolean; // defaults to true
  disable_pinch_to_zoom?: boolean; // defaults to false
  autorange_after_scroll?: boolean; // defaults to false
};

export type EntityConfig = EntityIdConfig & {
  unit_of_measurement?: string;
  internal: boolean;
  show_value:
    | boolean
    | {
        right_margin: number;
      };
  offset: number;
  extend_to_present: boolean;
  filters: FilterFn[];
  on_legend_click: Function;
  on_legend_dblclick: Function;
  on_click: Function;
} & Partial<Plotly.PlotData>;

export type Config = {
  title?: string;
  hours_to_show: number;
  refresh_interval: number | "auto"; // in seconds
  offset: number;
  entities: EntityConfig[];
  layout: Partial<Plotly.Layout>;
  config: Partial<Plotly.Config>;
  ha_theme: boolean;
  raw_plotly_config: boolean;
  significant_changes_only: boolean;
  minimal_response: boolean;
  disable_pinch_to_zoom: boolean;
  visible_range: [number, number];
  on_dblclick: Function;
  autorange_after_scroll: boolean;
};
export type EntityIdStateConfig = {
  entity: string;
};
export type EntityIdAttrConfig = {
  entity: string;
  attribute: string;
};
export type EntityIdStatisticsConfig = {
  entity: string;
  statistic: StatisticType;
  period: StatisticPeriod;
};
export type EntityIdConfig =
  | EntityIdStateConfig
  | EntityIdAttrConfig
  | EntityIdStatisticsConfig;

export function isEntityIdStateConfig(
  entityConfig: EntityIdConfig,
): entityConfig is EntityIdStateConfig {
  return !(
    isEntityIdAttrConfig(entityConfig) ||
    isEntityIdStatisticsConfig(entityConfig)
  );
}
export function isEntityIdAttrConfig(
  entityConfig: EntityIdConfig,
): entityConfig is EntityIdAttrConfig {
  return !!entityConfig["attribute"];
}
export function isEntityIdStatisticsConfig(
  entityConfig: EntityIdConfig,
): entityConfig is EntityIdStatisticsConfig {
  return !!entityConfig["statistic"];
}

export type Timestamp = number;

export type CachedBaseEntity = {
  fake_boundary_datapoint?: true;
  x: Date;
  y: YValue;
};
export type CachedStateEntity = CachedBaseEntity & {
  state: HassEntity;
};
export type CachedStatisticsEntity = CachedBaseEntity & {
  statistics: StatisticValue;
};
export type CachedEntity = CachedStateEntity | CachedStatisticsEntity;
export type EntityData = {
  states: HassEntity[];
  statistics: StatisticValue[];
  xs: Date[];
  ys: YValue[];
};

export type TimestampRange = Timestamp[]; // [Timestamp, Timestamp];
