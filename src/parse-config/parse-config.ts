import Cache from "../cache/Cache";
import getThemedLayout, { defaultLayout, HATheme } from "./themed-layout";

import propose from "propose";

import merge from "lodash/merge";
import get from "lodash/get";
import {
  defaultEntityRequired,
  defaultEntityOptional,
  defaultYamlRequired,
  defaultYamlOptional,
} from "./defaults";
import { parseTimeDuration } from "../duration/duration";
import { parseStatistics } from "./parse-statistics";
import { HomeAssistant } from "custom-card-helpers";
import filters from "../filters/filters";
import bounds from "binary-search-bounds";
import { has } from "lodash";
import { StatisticValue } from "../recorder-types";
import { Config, HassEntity, YValue } from "../types";

class ConfigParser {
  private yaml?: any;
  private errors?: Error[];
  private yaml_with_defaults?: any;
  private hass?: HomeAssistant;
  cache = new Cache();
  private busy = false;
  private fnParam!: FnParam;

  async update(input: { yaml: any; hass: HomeAssistant }) {
    if (this.busy) throw new Error("ParseConfig was updated while busy");
    this.busy = true;
    try {
      return this._update(input);
    } finally {
      this.busy = false;
    }
  }
  private async _update(input: {
    yaml: any;
    hass: HomeAssistant;
  }): Promise<{ errors: Error[]; parsed: Config }> {
    this.yaml = {};
    this.errors = [];

    this.hass = input.hass;
    const old_uirevision = this.yaml?.layout?.uirevision;
    this.yaml_with_defaults = JSON.parse(JSON.stringify(input.yaml));

    // 1st pass: add defaults
    this.yaml_with_defaults = merge(
      {},
      this.yaml_with_defaults,
      defaultYamlRequired,
      this.yaml_with_defaults.raw_plotly_config ? {} : defaultYamlOptional,
      this.yaml_with_defaults
    );
    for (let i = 1; i < 31; i++) {
      const yaxis = "yaxis" + (i == 1 ? "" : i);
      this.yaml_with_defaults.layout[yaxis] = merge(
        {},
        this.yaml_with_defaults.layout[yaxis],
        this.yaml_with_defaults.defaults?.yaxes,
        this.yaml_with_defaults.layout[yaxis]
      );
    }
    this.yaml_with_defaults.entities = this.yaml_with_defaults.entities.map(
      (entity) => {
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
          defaultEntityRequired,
          this.yaml_with_defaults.raw_plotly_config
            ? {}
            : defaultEntityOptional,
          this.yaml_with_defaults.defaults?.entity,
          entity
        );
        return entity;
      }
    );

    // 2nd pass: evaluate functions
    this.fnParam = {
      vars: {},
      path: "",
      hass: input.hass,
      getFromConfig: () => "",
    };
    for (const [key, value] of Object.entries(this.yaml_with_defaults)) {
      try {
        await this.evalNode({
          parent: this.yaml,
          path: key,
          key: key,
          value,
        });
      } catch (e) {
        console.warn(`Plotly Graph Card: Error parsing [${key}]`, e);
        this.errors?.push(e as Error);
      }
    }

    // 3rd pass: decorate
    /**
     * These cannot be done via defaults because they are functions and
     * functions would be overwritten if the user sets a configuration on a parent
     *  */
    const isBrowsing = !!input.yaml.visible_range;
    const yAxisTitles = Object.fromEntries(
      this.yaml.entities.map(({ unit_of_measurement, yaxis }) => [
        "yaxis" + yaxis?.slice(1),
        { title: unit_of_measurement },
      ])
    );
    merge(
      this.yaml.layout,
      this.yaml.raw_plotly_config ? {} : defaultLayout,
      this.yaml.ha_theme ? getThemedLayout(this.yaml.css_vars) : {},
      this.yaml.raw_plotly_config
        ? {}
        : {
            xaxis: {
              range: this.yaml.visible_range,
            },
            //changing the uirevision triggers a reset to the axes
            uirevision: isBrowsing ? old_uirevision : Math.random(),
          },
      this.yaml.raw_plotly_config ? {} : yAxisTitles,
      this.yaml.layout
    );

    return { errors: this.errors, parsed: this.yaml };
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
    this.fnParam.path = path;
    this.fnParam.getFromConfig = (pathQuery: string) =>
      this.getEvaledPath(pathQuery, path /* caller */);

    if (
      path.match(/^entities\.\d+\./) && //isInsideEntity
      !path.match(
        /^entities\.\d+\.(entity|attribute|time_offset|statistic|period)/
      ) && //isInsideFetchParamNode
      !this.fnParam.xs && // alreadyFetchedData
      (is$fn(value) || path.match(/^entities\.\d+\.filters\.\d+$/)) // if function of filter
    )
      await this.fetchDataForEntity(path);

    if (typeof value === "string" && value.startsWith("$fn")) {
      value = myEval(value.slice(3));
    }
    const error = getDeprecationError(path, value);
    if (error) this.errors?.push(error);

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
        const childPath = `${path}.${childKey}`;
        try {
          await this.evalNode({
            parent: me,
            path: childPath,
            key: childKey,
            value: childValue,
          });
        } catch (e: any) {
          console.warn(`Plotly Graph Card: Error parsing [${childPath}]`, e);
          this.errors?.push(new Error(`at [${childPath}]: ${e?.message || e}`));
        }
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
      if (!this.fnParam.getFromConfig("raw_plotly_config")) {
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
            texttemplate: `%{y:.2~f} ${this.fnParam.getFromConfig(
              `entities.${i}.unit_of_measurement`
            )}`, // here so it can be overwritten
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
        this.fnParam.getFromConfig("time_offset")
      );
      const ms = hours_to_show * 60 * 60 * 1000;
      visible_range = [
        +new Date() - ms + global_offset,
        +new Date() + global_offset,
      ] as [number, number];
      this.yaml.visible_range = visible_range;
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
      this.fnParam.getFromConfig(path + ".time_offset")
    );

    const range_to_fetch = [
      visible_range[0] - offset,
      visible_range[1] - offset,
    ];
    const fetch_mask = this.fnParam.getFromConfig("fetch_mask");
    const i = getEntityIndex(path);
    const data =
      // TODO: decide about minimal response
      fetch_mask[i] === false // also fetch if it is undefined. This means the entity is new
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
  private getEvaledPath(path: string, callingPath: string) {
    if (path.startsWith("."))
      path = callingPath
        .split(".")
        .slice(0, -1)
        .concat(path.slice(1).split("."))
        .join(".");
    if (has(this.yaml, path)) return get(this.yaml, path);

    let value = this.yaml_with_defaults;
    for (const key of path.split(".")) {
      if (value === undefined) return undefined;
      value = value[key];
      if (is$fn(value)) {
        throw new Error(
          `Since [${path}] is a $fn, it has to be defined before [${callingPath}]`
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
        `Filter '${filterName}' doesn't exist. Did you mean <b>${propose(
          filterName,
          Object.keys(filters)
        )}<b>?`
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
  path: string;
  xs?: Date[];
  ys?: YValue[];
  statistics?: StatisticValue[];
  states?: HassEntity[];
  meta?: HassEntity["attributes"];
};

function getDeprecationError(path: string, value: any) {
  const e = _getDeprecationError(path, value);
  if (e) return new Error(`at [${path}]: ${e}`);
  return null;
}
function _getDeprecationError(path: string, value: any) {
  if (path.match(/^no_theme$/))
    return "renamed to ha_theme (inverted logic) in v3.0.0";
  if (path.match(/^no_default_layout$/))
    return "replaced with more general raw_plotly_config in v3.0.0";
  if (path.match(/^offset$/)) return "renamed to time_offset in v3.0.0";
  if (path.match(/^entities\.\d+\.offset$/)) {
    try {
      parseTimeDuration(value);
      return 'renamed to time_offset in v3.0.0 to avoid conflicts with <a href="https://plotly.com/javascript/reference/bar/#bar-offset">bar-offsets</a>';
    } catch (e) {
      // bar-offsets are numbers without time unit
    }
  }
  if (path.match(/^entities\.\d+\.lambda$/))
    return "removed in v3.0.0, use filters instead";
  if (path.match(/^significant_changes_only$/))
    return "removed in v3.0.0, it is now always set to false";
  if (path.match(/^minimal_response$/))
    return "removed in v3.0.0, if you need attributes use the 'attribute' parameter instead.";
  return null;
}
export const getEntityIndex = (path: string) =>
  +path.match(/entities\.(\d+)/)![1];
export { ConfigParser };
