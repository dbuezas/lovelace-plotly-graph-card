import Cache from "../cache/Cache";
import getThemedLayout, { HATheme } from "./themed-layout";

import merge from "lodash/merge";
import get from "lodash/get";
import { defaultEntity, defaultYaml } from "./defaults";
import { parseTimeDuration } from "../duration/duration";
import { parseStatistics } from "./parse-statistics";
import { HomeAssistant } from "custom-card-helpers";
import filters from "../filters/filters";
import bounds from "binary-search-bounds";
import { has } from "lodash";
import { StatisticValue } from "../recorder-types";
import { HassEntity, YValue } from "../types";

class ConfigParser {
  private partiallyParsedConfig?: any;
  private inputConfig?: any;
  private hass?: HomeAssistant;
  cache = new Cache();
  private busy = false;
  private fnParam!: FnParam;

  async update(input: {
    raw_config: any;
    hass: HomeAssistant;
    cssVars: HATheme;
  }) {
    if (this.busy) throw new Error("ParseConfig was updated while busy");
    this.busy = true;
    try {
      this.hass = input.hass;
      const old_uirevision = this.partiallyParsedConfig?.layout?.uirevision;
      let config = JSON.parse(JSON.stringify(input.raw_config));

      // 1st pass: add defaults
      config = merge({}, config, defaultYaml, config);
      for (let i = 1; i < 31; i++) {
        const yaxis = "yaxis" + (i == 1 ? "" : i);
        config.layout[yaxis] = merge(
          {},
          config.layout[yaxis],
          config.defaults?.yaxes,
          config.layout[yaxis]
        );
      }
      config.entities = config.entities.map((entity) => {
        if (typeof entity === "string") entity = { entity };
        entity.entity ??= "";
        const [oldAPI_entity, oldAPI_attribute] = entity.entity.split("::");
        if (oldAPI_attribute) {
          entity.entity = oldAPI_entity;
          entity.attribute = oldAPI_attribute;
        }
        entity = merge(
          {},
          entity,
          defaultEntity,
          config.defaults?.entity,
          entity
        );
        return entity;
      });

      // 2nd pass: evaluate functions
      this.fnParam = {
        vars: {},
        hass: input.hass,
        key: "",
        getFromConfig: () => "",
      };
      this.partiallyParsedConfig = {};
      this.inputConfig = config;
      for (const [key, value] of Object.entries(config)) {
        await this.evalNode({
          parent: this.partiallyParsedConfig,
          path: key,
          key: key,
          value,
        });
      }

      // 3rd pass: decorate
      /**
       * These cannot be done via defaults because they are functions and
       * functions would be overwritten if the user sets a configuration on a parent
       *  */
      const isBrowsing = !!input.raw_config.visible_range;
      const yAxisTitles = Object.fromEntries(
        this.partiallyParsedConfig.entities.map(
          ({ unit_of_measurement, yaxis }) => [
            "yaxis" + yaxis.slice(1),
            { title: unit_of_measurement },
          ]
        )
      );
      merge(
        this.partiallyParsedConfig.layout,
        getThemedLayout(
          input.cssVars,
          this.partiallyParsedConfig.no_theme,
          this.partiallyParsedConfig.no_default_layout
        ),
        {
          xaxis: {
            range: this.partiallyParsedConfig.visible_range,
          },
          //changing the uirevision triggers a reset to the axes
          uirevision: isBrowsing ? old_uirevision : Math.random(),
        },
        this.partiallyParsedConfig.no_default_layout ? {} : yAxisTitles,
        this.partiallyParsedConfig.layout
      );

      return this.partiallyParsedConfig;
    } finally {
      this.busy = false;
    }
  }
  private async evalNode({
    parent,
    path,
    key,
    value,
  }: {
    parent: object;
    path: string;
    key: string;
    value: any;
  }) {
    if (path.match(/^defaults$/)) return;
    this.fnParam.key = key;
    this.fnParam.getFromConfig = (aPath: string) =>
      this.getEvaledPath({ path: aPath, callingPath: path });

    if (
      path.match(/^entities\.\d+\./) && //isInsideEntity
      !path.match(
        /^entities\.\d+\.(entity|attribute|offset|statistic|period)/
      ) && //isInsideFetchParamNode
      !this.fnParam.xs && // alreadyFetchedData
      (is$fn(value) || path.match(/^entities\.\d+\.filters\.\d+$/)) // if function of filter
    )
      await this.fetchDataForEntity(path);

    if (typeof value === "string" && value.startsWith("$fn")) {
      value = myEval(value.slice(3));
    }

    if (typeof value === "function") {
      /**
       * Allowing functions that return functions makes it very slow
       * This is mostly because of customdata, which returns an array as large as the cached data,
       * and the fact that awaits are expensive.
       */

      parent[key] = value = value(this.fnParam);
    } else if (isObjectOrArray(value)) {
      const me = Array.isArray(value) ? [] : {};
      parent[key] = me;
      for (const [childKey, childValue] of Object.entries(value)) {
        await this.evalNode({
          parent: me,
          path: `${path}.${childKey}`,
          key: childKey,
          value: childValue,
        });
      }
    } else {
      parent[key] = value;
    }

    // we're now on the way back of traversal, `value` is fully evaluated (not a function)

    if (path.match(/^entities\.\d+\.filters\.\d+$/)) {
      this.evalFilter({ parent, path, key, value });
    }
    if (path.match(/^entities\.\d+$/)) {
      if (!this.fnParam.xs) {
        await this.fetchDataForEntity(path);
      }
      const me = parent[key];
      if (!me.x) me.x = this.fnParam.xs;
      if (!me.y) me.y = this.fnParam.ys;
      if (me.x.length === 0 && me.y.length === 0) {
        /*
        Traces with no data are removed from the legend by plotly. 
        Setting them to have null element prevents that.
        */
        me.x = [new Date()];
        me.y = [null];
      }

      delete this.fnParam.xs;
      delete this.fnParam.ys;
      delete this.fnParam.statistics;
      delete this.fnParam.states;
      delete this.fnParam.meta;
    }
    if (path.match(/^entities$/)) {
      parent[key] = parent[key].filter(({ internal }) => !internal);
      const entities = parent[key];
      const count = entities.length;
      // Preserving the original sequence of real_traces is important for `fill: tonexty`
      // https://github.com/dbuezas/lovelace-plotly-graph-card/issues/87
      for (let i = 0; i < count; i++) {
        const trace = entities[i];
        if (trace.show_value) {
          trace.legendgroup ??= "group" + i;
          entities.push({
            texttemplate: `%{y:.2~f}%{customdata.unit_of_measurement}`, // here so it can be overwritten
            ...trace,
            cliponaxis: false, // allows the marker + text to be rendered above the right y axis. See https://github.com/dbuezas/lovelace-plotly-graph-card/issues/171
            mode: "text+markers",
            showlegend: false,
            hoverinfo: "skip",
            textposition: "middle right",
            marker: {
              color: trace.line?.color,
            },
            textfont: {
              color: trace.line?.color,
            },
            x: trace.x.slice(-1),
            y: trace.y.slice(-1),
          });
        }
      }
    }
  }

  private async fetchDataForEntity(path: string) {
    path = path.match(/^(entities\.\d+)\./)![1];
    let visible_range = this.fnParam.getFromConfig("visible_range");
    if (!visible_range) {
      const hours_to_show = this.fnParam.getFromConfig("hours_to_show");
      const global_offset = parseTimeDuration(
        this.fnParam.getFromConfig("offset")
      );
      const ms = hours_to_show * 60 * 60 * 1000;
      visible_range = [
        +new Date() - ms + global_offset,
        +new Date() + global_offset,
      ] as [number, number];
      this.partiallyParsedConfig.visible_range = visible_range;
    }
    this.observed_range[0] = Math.min(this.observed_range[0], visible_range[0]);
    this.observed_range[1] = Math.max(this.observed_range[1], visible_range[1]);
    const statisticsParams = parseStatistics(
      visible_range,
      this.fnParam.getFromConfig(path + ".statistic"),
      this.fnParam.getFromConfig(path + ".period")
    );
    const attribute = this.fnParam.getFromConfig(path + ".attribute") as
      | string
      | undefined;
    const fetchConfig = {
      entity: this.fnParam.getFromConfig(path + ".entity"),
      ...(statisticsParams ? statisticsParams : attribute ? { attribute } : {}),
    };
    const offset = parseTimeDuration(
      this.fnParam.getFromConfig(path + ".offset")
    );

    const range_to_fetch = [
      visible_range[0] - offset,
      visible_range[1] - offset,
    ];
    const fetch_mask = this.fnParam.getFromConfig("fetch_mask");
    const data =
      // TODO: decide about minimal response
      fetch_mask[this.fnParam.key] === false // also fetch if it is undefined. This means the entity is new
        ? this.cache.getData(fetchConfig)
        : await this.cache.fetch(range_to_fetch, fetchConfig, this.hass!);
    const extend_to_present =
      this.fnParam.getFromConfig(path + ".extend_to_present") ??
      !statisticsParams;

    data.xs = data.xs.map((x) => new Date(+x + offset));

    removeOutOfRange(data, this.observed_range);
    if (extend_to_present && data.xs.length > 0) {
      const last_i = data.xs.length - 1;
      const now = Math.min(this.observed_range[1], Date.now());
      data.xs.push(new Date(Math.min(this.observed_range[1], now + offset)));
      data.ys.push(data.ys[last_i]);
      if (data.states.length) data.states.push(data.states[last_i]);
      if (data.statistics.length) data.statistics.push(data.statistics[last_i]);
    }
    this.fnParam.xs = data.xs;
    this.fnParam.ys = data.ys;
    this.fnParam.statistics = data.statistics;
    this.fnParam.states = data.states;
    this.fnParam.meta = this.hass?.states[fetchConfig.entity]?.attributes || {};
  }
  private observed_range: [number, number] = [Date.now(), Date.now()];
  public resetObservedRange() {
    this.observed_range = [Date.now(), Date.now()];
  }
  private getEvaledPath(p: { path: string; callingPath: string }) {
    if (has(this.partiallyParsedConfig, p.path))
      return get(this.partiallyParsedConfig, p.path);

    let value = this.inputConfig;
    for (const key of p.path.split(".")) {
      if (value === undefined) return undefined;
      value = value[key];
      if (is$fn(value)) {
        throw new Error(
          `Since [${p.path}] is a $fn, it has to be defined before [${p.callingPath}]`
        );
      }
    }
    return value;
  }
  private evalFilter(input: {
    parent: object;
    path: string;
    key: string;
    value: any;
  }) {
    const obj = input.value;
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
    const filterfn = config === null ? filter() : filter(config);
    try {
      const r = filterfn(this.fnParam);
      for (const key in r) {
        this.fnParam[key] = r[key];
      }
    } catch (e) {
      console.error(e);
      throw new Error(`Error in filter: ${e}`);
    }
  }
}

const myEval = typeof window != "undefined" ? window.eval : global.eval;

function isObjectOrArray(value) {
  return value !== null && typeof value == "object" && !(value instanceof Date);
}

function is$fn(value) {
  return (
    typeof value === "function" ||
    (typeof value === "string" && value.startsWith("$fn"))
  );
}

function removeOutOfRange(data: any, range: [number, number]) {
  const first = bounds.le(data.xs, range[0]);
  if (first > -1) {
    data.xs.splice(0, first);
    data.xs[0] = new Date(range[0]);
    data.ys.splice(0, first);
    data.states.splice(0, first);
    data.statistics.splice(0, first);
  }
  const last = bounds.gt(data.xs, range[1]);
  if (last > -1) {
    data.xs.splice(last);
    data.ys.splice(last);
    data.states.splice(last);
    data.statistics.splice(last);
  }
}

type FnParam = {
  getFromConfig: (
    string
  ) => ReturnType<InstanceType<typeof ConfigParser>["getEvaledPath"]>;
  hass: HomeAssistant;
  vars: Record<string, any>;
  key: string;
  xs?: Date[];
  ys?: YValue[];
  statistics?: StatisticValue[];
  states?: HassEntity[];
  meta?: HassEntity["attributes"];
};

export { ConfigParser };
