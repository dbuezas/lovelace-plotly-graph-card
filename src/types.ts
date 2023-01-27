import {
  ColorSchemeArray,
  ColorSchemeNames,
} from "./parse-config/parse-color-scheme";
import { TimeDurationStr } from "./duration/duration";
import {
  AutoPeriodConfig,
  StatisticPeriod,
  StatisticType,
  StatisticValue,
} from "./recorder-types";

import { HassEntity } from "home-assistant-js-websocket";
import { FilterFn } from "./filters/filters";
export { HassEntity } from "home-assistant-js-websocket";

export type YValue = number | string | null;
export type InputConfig = {
  type: "custom:plotly-graph-card";
  hours_to_show?: number;
  refresh_interval?: number | "auto"; // in seconds
  color_scheme?: ColorSchemeNames | ColorSchemeArray | number;
  title?: string;
  offset?: TimeDurationStr;
  entities: ({
    entity?: string;
    attribute?: string;
    statistic?: StatisticType;
    period?: StatisticPeriod | "auto" | AutoPeriodConfig;
    unit_of_measurement?: string;
    lambda?: string;
    internal?: boolean;
    show_value?:
      | boolean
      | {
          right_margin: number;
        };
    offset?: TimeDurationStr;
    extend_to_present?: boolean;
    filters?: (Record<string, any> | string)[];
  } & Partial<Plotly.PlotData>)[];
  defaults?: {
    entity?: Partial<Plotly.PlotData>;
    yaxes?: Partial<Plotly.Layout["yaxis"]>;
  };
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  ha_theme?: boolean;
  raw_plotly_config?: boolean;
  significant_changes_only?: boolean; // defaults to false
  minimal_response?: boolean; // defaults to true
  disable_pinch_to_zoom?: boolean; // defaults to false
};

export type EntityConfig = EntityIdConfig & {
  unit_of_measurement?: string;
  lambda?: (
    y: YValue[],
    x: Date[],
    raw_entity: ((StatisticValue | HassEntity) & {
      timestamp: number;
      value: any;
    })[]
  ) => YValue[] | { x?: Date[]; y?: YValue[] };
  internal: boolean;
  show_value:
    | boolean
    | {
        right_margin: number;
      };
  offset: number;
  extend_to_present: boolean;
  filters: FilterFn[];
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
  entityConfig: EntityIdConfig
): entityConfig is EntityIdStateConfig {
  return !(
    isEntityIdAttrConfig(entityConfig) ||
    isEntityIdStatisticsConfig(entityConfig)
  );
}
export function isEntityIdAttrConfig(
  entityConfig: EntityIdConfig
): entityConfig is EntityIdAttrConfig {
  return !!entityConfig["attribute"];
}
export function isEntityIdStatisticsConfig(
  entityConfig: EntityIdConfig
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
