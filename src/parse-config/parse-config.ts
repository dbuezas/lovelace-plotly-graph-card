import Cache from "../cache/Cache";
import { HATheme } from "./themed-layout";

import propose from "propose";

import get from "lodash/get";
import { addPreParsingDefaults, addPostParsingDefaults } from "./defaults";
import {
  isRelativeTime,
  isTimeDuration,
  parseRelativeTime,
  parseTimeDuration,
  setDateFnDefaultOptions,
} from "../duration/duration";
import { parseStatistics } from "./parse-statistics";
import { HomeAssistant } from "custom-card-helpers";
import filters from "../filters/filters";
import bounds from "binary-search-bounds";
import { has } from "lodash";
import { StatisticValue } from "../recorder-types";
import { Config, EntityData, HassEntity, InputConfig, YValue } from "../types";
import getDeprecationError from "./deprecations";

class ConfigParser {
  private yaml: Partial<Config> = {};
  private errors?: Error[];
  private yaml_with_defaults?: InputConfig;
  private hass?: HomeAssistant;
  cache = new Cache();
  private busy = false;
  private fnParam!: FnParam;
  private observed_range: [number, number] = [Date.now(), Date.now()];
  public resetObservedRange() {
    this.observed_range = [Date.now(), Date.now()];
  }

  async update(input: {
    yaml: InputConfig;
    hass: HomeAssistant;
    css_vars: HATheme;
  }) {
    if (this.busy) throw new Error("ParseConfig was updated while busy");
    this.busy = true;
    try {
      return this._update(input);
    } finally {
      this.busy = false;
    }
  }
  private async _update({
    yaml: input_yaml,
    hass,
    css_vars,
  }: {
    yaml: InputConfig;
    hass: HomeAssistant;
    css_vars: HATheme;
  }): Promise<{ errors: Error[]; parsed: Config }> {
    this.yaml = {};
    this.errors = [];
    this.hass = hass;
    this.yaml_with_defaults = addPreParsingDefaults(input_yaml, css_vars);
    setDateFnDefaultOptions(hass);

    this.fnParam = {
      vars: {},
      path: "",
      hass,
      css_vars,
      getFromConfig: () => "",
      get: () => "",
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
    this.yaml = addPostParsingDefaults(this.yaml as Config);

    return { errors: this.errors, parsed: this.yaml as Config };
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
    this.fnParam.get = this.fnParam.getFromConfig;

    if (
      !this.fnParam.xs && // hasn't fetched yet
      path.match(/^entities\.\d+\./) &&
      !path.match(
        /^entities\.\d+\.(entity|attribute|time_offset|statistic|period)/
      ) && //isInsideFetchParamNode
      (is$fn(value) || path.match(/^entities\.\d+\.filters\.\d+$/)) // if function of filter
    ) {
      const entityPath = path.match(/^(entities\.\d+)\./)![1];
      await this.fetchDataForEntity(entityPath);
    }

    if (typeof value === "string") {
      if (value.startsWith("$ex")) {
        value =
          "$fn ({ getFromConfig, get, hass, vars, path, css_vars, xs, ys, statistics, states, meta }) => " +
          value.slice(3);
      }
      if (value.startsWith("$fn")) {
        value = myEval(value.slice(3));
      }
    }
    const error = getDeprecationError(path, value);
    if (error) this.errors?.push(error);

    if (typeof value === "function") {
      /**
       * Allowing functions that return functions makes it very slow when large arrays are returned.
       * This is because awaits are expensive.
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
    value = parent[key];

    if (path.match(/^entities\.\d+\.filters\.\d+$/)) {
      await this.evalFilter({ parent, path, key, value });
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
    let visible_range = this.fnParam.getFromConfig("visible_range");
    if (!visible_range) {
      let global_offset = parseTimeDuration(
        this.fnParam.getFromConfig("time_offset")
      );
      const hours_to_show = this.fnParam.getFromConfig("hours_to_show");
      if (isRelativeTime(hours_to_show)) {
        const [start, end] = parseRelativeTime(hours_to_show);
        visible_range = [start + global_offset, end + global_offset] as [
          number,
          number
        ];
      } else {
        let ms_to_show;
        if (isTimeDuration(hours_to_show)) {
          ms_to_show = parseTimeDuration(hours_to_show);
        } else if (typeof hours_to_show === "number") {
          ms_to_show = hours_to_show * 60 * 60 * 1000;
        } else {
          throw new Error(
            `${hours_to_show} is not a valid duration. Use numbers, durations (e.g 1d) or dynamic time (e.g current_day)`
          );
        }
        visible_range = [
          +new Date() - ms_to_show + global_offset,
          +new Date() + global_offset,
        ] as [number, number];
      }
      this.yaml.visible_range = visible_range;
    }
    if (this.fnParam.getFromConfig("autorange_after_scroll")) {
      this.observed_range = visible_range.slice();
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
      // Todo: should this be done after the entity was fully evaluated?
      // this would make it also work if filters change the data.
      // Would also need to be combined with yet another removeOutOfRange call.
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
  private async evalFilter(input: {
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
        )}<b>?\nOthers: ${Object.keys(filters)}`
      );
    }
    const filterfn = config === null ? filter() : filter(config);
    try {
      const r = await filterfn(this.fnParam);
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
    (typeof value === "string" && value.startsWith("$fn")) ||
    (typeof value === "string" && value.startsWith("$ex"))
  );
}

function removeOutOfRange(data: EntityData, range: [number, number]) {
  const first = bounds.le(data.xs, new Date(range[0]));
  if (first > -1) {
    data.xs.splice(0, first);
    data.xs[0] = new Date(range[0]);
    data.ys.splice(0, first);
    data.states.splice(0, first);
    data.statistics.splice(0, first);
  }
  const last = bounds.gt(data.xs, new Date(range[1]));
  if (last > -1) {
    data.xs.splice(last);
    data.ys.splice(last);
    data.states.splice(last);
    data.statistics.splice(last);
  }
}
type GetFromConfig = (
  string
) => ReturnType<InstanceType<typeof ConfigParser>["getEvaledPath"]>;
type FnParam = {
  getFromConfig: GetFromConfig;
  get: GetFromConfig;
  hass: HomeAssistant;
  vars: Record<string, any>;
  path: string;
  css_vars: HATheme;
  xs?: Date[];
  ys?: YValue[];
  statistics?: StatisticValue[];
  states?: HassEntity[];
  meta?: HassEntity["attributes"];
};
export const getEntityIndex = (path: string) =>
  +path.match(/entities\.(\d+)/)![1];
export { ConfigParser };
