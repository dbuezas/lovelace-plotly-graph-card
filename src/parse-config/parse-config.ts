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

// TODO: use Function
const myEval = typeof window != "undefined" ? window.eval : global.eval;

function isObjectOrArray(value) {
  return value !== null && typeof value == "object" && !(value instanceof Date);
}
const w = window as any;

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

class ConfigParser {
  private partiallyParsedConfig?: any;
  private inputConfig?: any;
  private hass?: HomeAssistant;
  cache = new Cache();
  private busy = false;
  private t_fetch = 0;
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
  private async fetchDataForEntity({
    path,
    fnParam,
  }: {
    parent: object;
    path: string;
    key: string;
    value: any;
    fnParam: any;
  }) {
    path = path.match(/^(entities\.\d+)\./)![1];
    let visible_range = fnParam.getFromConfig("visible_range");
    if (!visible_range) {
      const hours_to_show = fnParam.getFromConfig("hours_to_show");
      const global_offset = parseTimeDuration(fnParam.getFromConfig("offset"));
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
      fnParam.getFromConfig(path + ".statistic"),
      fnParam.getFromConfig(path + ".period")
    );
    const attribute = fnParam.getFromConfig(path + ".attribute") as
      | string
      | undefined;
    const fetchConfig = {
      entity: fnParam.getFromConfig(path + ".entity"),
      ...(statisticsParams ? statisticsParams : attribute ? { attribute } : {}),
    };
    const offset = parseTimeDuration(fnParam.getFromConfig(path + ".offset"));

    const range_to_fetch = [
      visible_range[0] - offset,
      visible_range[1] - offset,
    ];
    const t0 = performance.now();
    const fetch_mask = fnParam.getFromConfig("fetch_mask");
    const data =
      fetch_mask[fnParam.entityIdx] === false // also fetch if it is undefined. This means the entity is new
        ? this.cache.getData(fetchConfig)
        : await this.cache.fetch(range_to_fetch, fetchConfig, this.hass!);
    const extend_to_present =
      fnParam.getFromConfig(path + ".extend_to_present") ?? !statisticsParams;

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
    this.t_fetch += performance.now() - t0;
    fnParam.data = {
      ...data,
      meta: this.hass?.states[fetchConfig.entity]?.attributes || {},
      vars: fnParam.vars,
      hass: this.hass!,
    };
  }
  private async fetchDataForEntityIfNecessary(p: {
    parent: object;
    path: string;
    key: string;
    value: any;
    fnParam: any;
  }) {
    const isInsideEntity = !!p.path.match(/^entities\.\d+\./);
    const isInsideFetchParamNode = !!p.path.match(
      /^entities\.\d+\.(entity|attribute|offset|statistic|period)/
    );
    const alreadyFetchedData = p.fnParam.data;
    const isFilters = p.path.match(/^entities\.\d+\.filters\.\d+$/);
    if (
      isInsideEntity &&
      !isInsideFetchParamNode &&
      !alreadyFetchedData &&
      (is$fn(p.value) || isFilters)
    )
      await this.fetchDataForEntity(p);
  }
  private async evalNode({
    parent,
    path,
    key,
    value,
    fnParam,
  }: {
    parent: object;
    path: string;
    key: string;
    value: any;
    fnParam: any;
  }) {
    w.i++;
    console.log(path);
    if (path.match(/^defaults$/)) return;
    if (path.match(/^entities\.\d+$/)) {
      fnParam.entityIdx = key;
    }
    fnParam.getFromConfig = (aPath: string) =>
      this.getEvaledPath({ path: aPath, callingPath: path });
    await this.fetchDataForEntityIfNecessary({
      parent,
      path,
      key,
      value,
      fnParam,
    });

    if (typeof value === "string" && value.startsWith("$fn")) {
      value = myEval(value.slice(3));
    }

    if (typeof value === "function") {
      /**
       * Allowing functions that return functions makes it very slow
       * This is mostly because of customdata, which returns an array as large as the cached data,
       * and the fact that awaits are expensive.
       */

      parent[key] = value = value(fnParam);
    } else if (isObjectOrArray(value)) {
      const me = Array.isArray(value) ? [] : {};
      parent[key] = me;
      for (const [childKey, childValue] of Object.entries(value)) {
        await this.evalNode({
          parent: me,
          path: `${path}.${childKey}`,
          key: childKey,
          value: childValue,
          fnParam,
        });
      }
    } else {
      parent[key] = value;
    }

    // we're now on the way back of traversal, `value` is fully evaluated

    if (path.match(/^entities\.\d+$/)) {
      if (!fnParam.data) {
        await this.fetchDataForEntity({
          parent,
          path,
          key,
          value,
          fnParam,
        });
      }
      const me = parent[key];
      if (!me.x) me.x = fnParam.data.xs;
      if (!me.y) me.y = fnParam.data.ys;
      if (me.x.length === 0 && me.y.length === 0) {
        /*
        Traces with no data are removed from the legend by plotly. 
        Setting them to have null element prevents that.
        */
        me.x = [new Date()];
        me.y = [null];
      }
      delete fnParam.data;
      delete fnParam.entityIdx;
    }

    if (path.match(/^entities\.\d+\.filters\.\d+$/)) {
      evalFilter({ parent, path, key, value, fnParam });
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
  async update(input: {
    raw_config: any;
    hass: HomeAssistant;
    cssVars: HATheme;
  }) {
    w.i = 0;
    const t0 = performance.now();
    this.t_fetch = 0;
    /*
      TODOs:
      * REMEMBER TO PASS visible entities
      * const visibleEntities = this.parsed_config.entities.filter(
        (_, i) => this.contentEl.data[i]?.visible !== "legendonly"
      );
      * remember to pass observed_range (all viewed ranges) to cap the range of the data
    */
    if (this.busy) throw new Error("ParseConfig was updated while busy");
    this.busy = true;
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
    const fnParam = {
      vars: {},
      hass: input.hass,
    };
    this.partiallyParsedConfig = {};
    this.inputConfig = config;
    for (const [key, value] of Object.entries(config)) {
      await this.evalNode({
        parent: this.partiallyParsedConfig,
        path: key,
        key: key,
        value,
        fnParam,
      });
    }

    // 3rd pass: decorate
    // TODO: do this in defaults
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
    this.busy = false;

    const t_total = performance.now() - t0;
    console.table({
      t_total,
      t_fetch: this.t_fetch,
      t_parse: t_total - this.t_fetch,
    });
    console.log(w.i);
    return this.partiallyParsedConfig;
  }
}

export { ConfigParser };

function evalFilter(input: {
  parent: object;
  path: string;
  key: string;
  value: any;
  fnParam: any;
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
    throw new Error(`Filter '${filterName} must be [${Object.keys(filters)}]`);
  }
  const filterfn = config === null ? filter() : filter(config);
  try {
    const fnParam = input.fnParam;
    fnParam.data.vars = fnParam.vars;
    input.fnParam.data = {
      ...input.fnParam.data,
      ...filterfn(input.fnParam.data),
    };
    fnParam.vars = fnParam.data.vars;
  } catch (e) {
    console.error(e);
    throw new Error(`Error in filter: ${e}`);
  }
}
