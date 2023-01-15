import Cache from "../cache/Cache";
import getThemedLayout, { HATheme } from "./themed-layout";

import merge from "lodash/merge";
import get from "lodash/get";
import { defaultEntity, defaultYaml } from "./defaults";
import { parseTimeDuration } from "../duration/duration";
import { parseStatistics } from "./parse-statistics";
import { HomeAssistant } from "custom-card-helpers";
import filters from "../filters/filters";

// TODO: use Function
const myEval = typeof window != "undefined" ? window.eval : global.eval;

function isObjectOrArray(value) {
  return typeof value == "object" && !(value instanceof Date);
}

function is$fn(value) {
  return (
    typeof value === "function" ||
    (typeof value === "string" && value.startsWith("$fn"))
  );
}

class ConfigParser {
  private partiallyParsedConfig?: any;
  private inputConfig?: any;
  private hass?: HomeAssistant;
  private cache = new Cache();

  private getEvaledPath(p: { path: string; callingPath: string }) {
    let value = get(this.partiallyParsedConfig, p.path);
    if (value !== undefined) return value;
    value = get(this.inputConfig, p.path);
    if (is$fn(value)) {
      throw new Error(
        `Since [${p.path}] is a $fn, it has to be defined before [${p.callingPath}]`
      );
    }
    return value;
  }
  private async evalEntity({
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
    const keys = Object.keys(value);
    const requiredKeys = [
      "entity",
      "attribute",
      "offset",
      "statistic",
      "period",
    ];
    let idxOfFirstFn = Object.entries(value).findIndex(
      ([childKey, childValue]) =>
        !requiredKeys.includes(childKey) && is$fn(childValue)
    );
    console.log("idxOfFirstFn", idxOfFirstFn, keys[idxOfFirstFn]);
    fnParam.entityIdx = key;
    const me: any = (parent[key] = {});
    for (let i = 0; i < keys.length; i++) {
      const childKey = keys[i];
      const childValue = value[childKey];
      const childPath = `${path}.${childKey}`;
      fnParam.getFromConfig = (aPath: string) =>
        this.getEvaledPath({ path: aPath, callingPath: childPath });
      if (i === idxOfFirstFn) {
        await this.fetchDataForEntity(fnParam, path);
      }

      await this.evalNode({
        parent: me,
        path: childPath,
        key: childKey,
        value: childValue,
        fnParam,
      });
    }
    if (idxOfFirstFn === -1) await this.fetchDataForEntity(fnParam, path);
  }
  private async fetchDataForEntity(fnParam: any, path: string) {
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
    const fetchConfig = {
      offset: parseTimeDuration(fnParam.getFromConfig(path + ".offset")),
      entity: fnParam.getFromConfig(path + ".entity"),
      attribute: fnParam.getFromConfig(path + ".attribute"),
      ...parseStatistics(
        visible_range,
        fnParam.getFromConfig(path + ".statistic"),
        fnParam.getFromConfig(path + ".period")
      ),
    };
    const range_to_fetch = [
      visible_range[0] - fetchConfig.offset,
      visible_range[1] - fetchConfig.offset,
    ];
    await this.cache.fetch(range_to_fetch, fetchConfig, this.hass!);

    fnParam.data = {
      ...this.cache.getData(fetchConfig),
      meta: this.hass?.states[fetchConfig.entity]?.attributes,
      vars: fnParam.vars,
      hass: this.hass!,
    };
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
    if (path.match(/^defaults$/)) return;

    if (typeof value === "string" && value.startsWith("$fn")) {
      value = myEval(value.slice(3));
    }

    if (typeof value === "function") value = value(fnParam);

    if (path.match(/^entities\.\d+$/)) {
      await this.evalEntity({ parent, path, key, value, fnParam });
      const me = parent[key];
      if (!me.x) {
        me.x = fnParam.data.xs;
      }
      if (!me.y) {
        me.y = fnParam.data.ys;
      }
      delete fnParam.data;
      if (me.x.length === 0 && me.y.length === 0) {
        /*
          Traces with no data are removed from the legend by plotly. 
          Setting them to have null element prevents that.
        */
        me.x = [new Date()];
        me.y = [null];
      }
    } else if (isObjectOrArray(value)) {
      const me = Array.isArray(value) ? [] : {};
      parent[key] = me;
      for (const [childKey, childValue] of Object.entries(value)) {
        const childPath = `${path}.${childKey}`;
        fnParam.getFromConfig = (aPath: string) =>
          this.getEvaledPath({ path: aPath, callingPath: childPath });
        await this.evalNode({
          parent: me,
          path: childPath,
          key: childKey,
          value: childValue,
          fnParam,
        });
      }
    } else {
      parent[key] = value;
    }

    // we're now on the way back of traversal, `value` is fully evaluated
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
    /*
      TODOs:
      * REMEMBER TO PASS this.size
      * REMEMBER TO PASS visible entities
      * const visibleEntities = this.parsed_config.entities.filter(
        (_, i) => this.contentEl.data[i]?.visible !== "legendonly"
      );
      * remember to pass visible_range
      * remember to pass observed_range (all viewed ranges) to cap the range of the data
    */
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
          yaxis,
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
