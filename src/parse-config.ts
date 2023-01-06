import { getIsPureObject } from "./utils";
import {
  AutoPeriodConfig,
  StatisticPeriod,
  StatisticType,
  STATISTIC_PERIODS,
  STATISTIC_TYPES,
} from "./recorder-types";
import colorSchemes, {
  ColorSchemeArray,
  isColorSchemeArray,
} from "./color-schemes";
import { Config, EntityConfig, InputConfig } from "./types";
import { parseTimeDuration } from "./duration/duration";
import merge from "lodash/merge";
import filters from "./filters/filters";

function parseColorScheme(config: InputConfig): ColorSchemeArray {
  const schemeName = config.color_scheme ?? "category10";
  const colorScheme = isColorSchemeArray(schemeName)
    ? schemeName
    : colorSchemes[schemeName] ||
      colorSchemes[Object.keys(colorSchemes)[schemeName]] ||
      null;
  if (colorScheme === null) {
    throw new Error(
      `color_scheme: "${
        config.color_scheme
      }" is not valid. Valid are an array of colors (see readme) or ${Object.keys(
        colorSchemes
      )}`
    );
  }
  return colorScheme;
}

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
function parseStatistics(entity: InputConfig["entities"][0]) {
  if (!entity.statistic && !entity.period) return {};
  const statistic: StatisticType = entity.statistic || "mean";

  if (!STATISTIC_TYPES.includes(statistic))
    throw new Error(
      `statistic: "${entity.statistic}" is not valid. Use ${STATISTIC_TYPES}`
    );
  if (getIsAutoPeriodConfig(entity.period)) {
    return {
      statistic,
      autoPeriod: entity.period,
      period: undefined,
    };
  }
  if (entity.period === "auto") {
    return {
      statistic,
      autoPeriod: {
        "0s": "5minute",
        "1d": "hour",
        "7d": "day",
        "28d": "week",
        "12M": "month",
      },
      period: undefined,
    };
  }
  const period: StatisticPeriod = entity.period || "hour";
  if (!STATISTIC_PERIODS.includes(period))
    throw new Error(
      `period: "${entity.period}" is not valid. Use ${STATISTIC_PERIODS}`
    );
  return {
    statistic,
    period,
    autoPeriod: undefined,
  };
}
function parseEntities(config: InputConfig): EntityConfig[] {
  const colorScheme = parseColorScheme(config);
  return config.entities.map((entityIn, entityIdx) => {
    if (typeof entityIn === "string") entityIn = { entity: entityIn };
    entityIn.entity ??= "";
    const [oldAPI_entity, oldAPI_attribute] = entityIn.entity.split("::");
    if (oldAPI_attribute) {
      entityIn.entity = oldAPI_entity;
      entityIn.attribute = oldAPI_attribute;
    }
    entityIn = merge(
      {
        hovertemplate: `<b>%{customdata.name}</b><br><i>%{x}</i><br>%{y}%{customdata.unit_of_measurement}<extra></extra>`,
        mode: "lines",
        show_value: false,
        line: {
          width: 1,
          shape: "hv",
          color: colorScheme[entityIdx % colorScheme.length],
        },
      },
      config.defaults?.entity,
      entityIn
    );

    const statisticConfig = parseStatistics(entityIn);
    if (entityIn.filters && !Array.isArray(entityIn.filters)) {
      throw new Error(
        "filters: should be an array, did you forget adding '-' before the filter name?"
      );
    }
    const parsedFilters = (entityIn.filters || []).map((obj) => {
      let filterName: string;
      let config: any = null;
      if (typeof obj === "string") {
        filterName = obj;
      } else {
        filterName = Object.keys(obj)[0];
        config = Object.values(obj)[0];
      }
      const filter = filters[filterName];
      if (!filter) {
        throw new Error(
          `Filter '${filterName} must be [${Object.keys(filters)}]`
        );
      }
      return config === null ? filter() : filter(config);
    });
    return {
      ...(entityIn as any), // ToDo: make this type safe
      internal: !!entityIn.internal,
      offset: parseTimeDuration(entityIn.offset ?? "0s"),
      lambda: entityIn.lambda && window.eval(entityIn.lambda),
      filters: parsedFilters,
      ...statisticConfig,
      extend_to_present:
        entityIn.extend_to_present ?? !statisticConfig.statistic,
    };
  });
}

export default function parseConfig(config: InputConfig): Config {
  if (
    typeof config.refresh_interval !== "number" &&
    config.refresh_interval !== undefined &&
    config.refresh_interval !== "auto"
  ) {
    throw new Error(
      `refresh_interval: "${config.refresh_interval}" is not valid. Must be either "auto" or a number (in seconds). `
    );
  }
  return {
    title: config.title,
    hours_to_show: config.hours_to_show ?? 1,
    refresh_interval: config.refresh_interval ?? "auto",
    offset: parseTimeDuration(config.offset ?? "0s"),
    entities: parseEntities(config),
    layout: merge(
      {
        yaxis: merge({}, config.defaults?.yaxes),
        yaxis2: merge({}, config.defaults?.yaxes),
        yaxis3: merge({}, config.defaults?.yaxes),
        yaxis4: merge({}, config.defaults?.yaxes),
        yaxis5: merge({}, config.defaults?.yaxes),
        yaxis6: merge({}, config.defaults?.yaxes),
        yaxis7: merge({}, config.defaults?.yaxes),
        yaxis8: merge({}, config.defaults?.yaxes),
        yaxis9: merge({}, config.defaults?.yaxes),
        yaxis10: merge({}, config.defaults?.yaxes),
        yaxis11: merge({}, config.defaults?.yaxes),
        yaxis12: merge({}, config.defaults?.yaxes),
        yaxis13: merge({}, config.defaults?.yaxes),
        yaxis14: merge({}, config.defaults?.yaxes),
        yaxis15: merge({}, config.defaults?.yaxes),
        yaxis16: merge({}, config.defaults?.yaxes),
        yaxis17: merge({}, config.defaults?.yaxes),
        yaxis18: merge({}, config.defaults?.yaxes),
        yaxis19: merge({}, config.defaults?.yaxes),
        yaxis20: merge({}, config.defaults?.yaxes),
        yaxis21: merge({}, config.defaults?.yaxes),
        yaxis22: merge({}, config.defaults?.yaxes),
        yaxis23: merge({}, config.defaults?.yaxes),
        yaxis24: merge({}, config.defaults?.yaxes),
        yaxis25: merge({}, config.defaults?.yaxes),
        yaxis26: merge({}, config.defaults?.yaxes),
        yaxis27: merge({}, config.defaults?.yaxes),
        yaxis28: merge({}, config.defaults?.yaxes),
        yaxis29: merge({}, config.defaults?.yaxes),
        yaxis30: merge({}, config.defaults?.yaxes),
      },
      config.layout
    ),
    config: {
      ...config.config,
    },
    no_theme: config.no_theme ?? false,
    no_default_layout: config.no_default_layout ?? false,
    significant_changes_only: config.significant_changes_only ?? false,
    minimal_response: config.minimal_response ?? true,
    disable_pinch_to_zoom: config.disable_pinch_to_zoom ?? false,
    show_entity_info_on_itemclick:
      config.show_entity_info_on_itemclick ?? false,
    show_entity_info_on_itemdoubleclick:
      config.show_entity_info_on_itemdoubleclick ?? false,
  };
}
