import { HomeAssistant } from "custom-card-helpers";
import merge from "lodash/merge";
import mapValues from "lodash/mapValues";
import EventEmitter from "events";
import { version } from "../package.json";
import insertStyleHack from "./style-hack";
import Plotly from "./plotly";
import {
  Config,
  EntityConfig,
  InputConfig,
  isEntityIdAttrConfig,
  isEntityIdStateConfig,
  isEntityIdStatisticsConfig,
  TimestampRange,
} from "./types";
import Cache from "./cache/Cache";
import getThemedLayout from "./themed-layout";
import isProduction from "./is-production";
import { sleep } from "./utils";
import { Datum } from "plotly.js";
import { parseISO } from "date-fns";
import { StatisticPeriod } from "./recorder-types";
import { parseTimeDuration } from "./duration/duration";
import parseConfig from "./parse-config";

const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

function extendLastDatapointToPresent(
  xs: Datum[],
  ys: Datum[],
  offset: number
) {
  if (xs.length === 0) return;
  const last = ys[ys.length - 1];
  xs.push(new Date(Date.now() + offset));
  ys.push(last);
}
function removeOutOfRange(xs: Datum[], ys: Datum[], range: TimestampRange) {
  let first = -1;
  let last = -1;

  for (let i = 0; i < xs.length; i++) {
    if (xs[i]! < range[0]) first = i;
    if (xs[i]! > range[1]) last = i;
  }
  if (last > -1) {
    xs.splice(last);
    ys.splice(last);
  }
  if (first > -1) {
    xs.splice(0, first);
    ys.splice(0, first);
  }
}

console.info(
  `%c ${componentName.toUpperCase()} %c ${version} ${process.env.NODE_ENV}`,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);

export class PlotlyGraph extends HTMLElement {
  contentEl: Plotly.PlotlyHTMLElement & {
    data: (Plotly.PlotData & { entity: string })[];
    layout: Plotly.Layout;
  };
  msgEl: HTMLElement;
  cardEl: HTMLElement;
  resetButtonEl: HTMLButtonElement;
  titleEl: HTMLElement;
  config!: InputConfig;
  parsed_config!: Config;
  cache = new Cache();
  size: { width?: number; height?: number } = {};
  _hass?: HomeAssistant;
  isBrowsing = false;
  isInternalRelayout = 0;

  handles: {
    resizeObserver?: ResizeObserver;
    relayoutListener?: EventEmitter;
    restyleListener?: EventEmitter;
    refreshTimeout?: number;
  } = {};
  disconnectedCallback() {
    this.handles.resizeObserver!.disconnect();
    this.handles.relayoutListener!.off("plotly_relayout", this.onRelayout);
    this.handles.restyleListener!.off("plotly_restyle", this.onRestyle);
    clearTimeout(this.handles.refreshTimeout!);
  }
  constructor() {
    super();
    if (!isProduction) {
      // for dev purposes
      // @ts-expect-error
      window.plotlyGraphCard = this;
    }
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <ha-card>
          <style>
            ha-card{
              overflow: hidden;
              background: transparent;
              width: 100%;
              height: calc(100% - 5px);
            }
            ha-card > #plotly{
              width: 100px;
            }
            ha-card > #title{
              text-align: center;
              background: var(--card-background-color);
              color: var(--secondary-text-color);
              margin: 0;
              padding-top: 10px;
              font-size: 1.2em;
            }
            button#reset.hidden{
              display: none;
            }
            button#reset {
              position: absolute;
              display: block;
              top: 13px;
              left: 15px;
              height: 19px;
              color: rgb(114, 114, 114);
              background: rgb(238, 238, 238);
              border: 0px;
              border-radius: 3px;
            }
            #msg {
              position: absolute;
              color: red;
              top: 0;
              background: rgba(0, 0, 0, 0.4);
              overflow-wrap: break-word;
              width: 100%;
            }
          </style>
          <div id="title"> </div>
          <div id="plotly"> </div>
          <span id="msg"> </span>
          <button id="reset" class="hidden">↻</button>
        </ha-card>`;
    this.msgEl = shadow.querySelector("#msg")!;
    this.cardEl = shadow.querySelector("ha-card")!;
    this.contentEl = shadow.querySelector("div#plotly")!;
    this.resetButtonEl = shadow.querySelector("button#reset")!;
    this.titleEl = shadow.querySelector("ha-card > #title")!;
    this.resetButtonEl.addEventListener("click", this.exitBrowsingMode);
    insertStyleHack(shadow.querySelector("style")!);
    this.contentEl.style.visibility = "hidden";
    this.withoutRelayout(() => Plotly.newPlot(this.contentEl, [], {}));
  }
  get hass() {
    return this._hass;
  }
  set hass(hass) {
    if (!hass) {
      // shouldn't happen, this is only to let typescript know hass != undefined
      return;
    }
    if (this.parsed_config?.refresh_interval === "auto") {
      let shouldPlot = false;
      let shouldFetch = false;
      for (const entity of this.parsed_config.entities) {
        const newState = hass.states[entity.entity];
        const oldState = this._hass?.states[entity.entity];
        if (newState && oldState !== newState) {
          const start = +new Date(
            oldState?.last_updated || newState.last_updated
          );
          const end = +new Date(newState.last_updated);
          const range: [number, number] = [start, end];
          let value: string | undefined;
          if (isEntityIdAttrConfig(entity)) {
            value = newState.attributes[entity.attribute];
          } else if (isEntityIdStateConfig(entity)) {
            value = newState.state;
          } else if (isEntityIdStatisticsConfig(entity)) {
            shouldFetch = true;
          }

          if (value !== undefined) {
            this.cache.add(
              entity,
              [{ ...newState, timestamp: end, value }],
              range
            );
            shouldPlot = true;
          }
        }
      }
      if (shouldFetch) {
        this.fetch();
      } else if (shouldPlot) {
        this.plot();
      }
    }
    this._hass = hass;
  }
  connectedCallback() {
    this.setupListeners();
  }
  async withoutRelayout(fn: Function) {
    this.isInternalRelayout++;
    await fn();
    this.isInternalRelayout--;
  }
  setupListeners() {
    const updateCardSize = async () => {
      const width = this.cardEl.offsetWidth;
      this.contentEl.style.position = "absolute";
      const height = this.cardEl.offsetHeight;
      this.contentEl.style.position = "";
      this.size = { width };
      if (height > 100) {
        // Panel view type has the cards covering 100% of the height of the window.
        // Masonry lets the cards grow by themselves.
        // if height > 100 ==> Panel ==> use available height
        // else ==> Mansonry ==> let the height be determined by defaults
        this.size.height = height - this.titleEl.offsetHeight;
      }
      this.withoutRelayout(async () => {
        const layout = this.getLayout();
        await Plotly.relayout(this.contentEl, {
          width: layout.width,
          height: layout.height,
        });
      });
    };
    this.handles.resizeObserver = new ResizeObserver(updateCardSize);
    this.handles.resizeObserver.observe(this.cardEl);

    updateCardSize();
    this.handles.relayoutListener = this.contentEl.on(
      "plotly_relayout",
      this.onRelayout
    )!;
    this.handles.restyleListener = this.contentEl.on(
      "plotly_restyle",
      this.onRestyle
    )!;
  }
  getAutoFetchRange() {
    const ms = this.parsed_config.hours_to_show * 60 * 60 * 1000;
    return [
      +new Date() - ms + this.parsed_config.offset,
      +new Date() + this.parsed_config.offset,
    ] as [number, number];
  }
  getAutoFetchRangeWithValueMargins() {
    const [start, end] = this.getAutoFetchRange();
    const padPercent = Math.max(
      ...this.parsed_config.entities.map(({ show_value }) => {
        if (show_value === false) return 0 / 100;
        if (show_value === true) return 10 / 100;
        return show_value.right_margin / 100;
      })
    );
    const msToShow = this.parsed_config.hours_to_show * 1000 * 60 * 60;
    const msPad = (msToShow / (1 - padPercent)) * padPercent;
    return [start, end + msPad];
  }
  getVisibleRange() {
    return this.contentEl.layout.xaxis!.range!.map((date) => {
      // if autoscale is used after scrolling, plotly returns the dates as timestamps (numbers) instead of iso strings
      if (Number.isFinite(date)) return date;
      if (date.startsWith("-")) {
        /*
         The function parseISO can't handle negative dates.
         To work around that, I'm parsing it without the minus, and then manually calculating the timestamp from that.
         The arithmetic has a twist because timestamps start on 1970 and not on year zero,
         so the distance to a the year zero has to be calculated by subtracting the "zero year" timestamp.
         positive_date = -date (which is negative)
         timestamp = (year 0) - (time from year 0)
         timestamp = (year 0) - (positive_date - year 0)
         timestamp = 2 * (year 0) - positive_date
         timestamp = 2 * (year 0) - (-date)
        */
        return (
          2 * +parseISO("0000-01-01 00:00:00.000") - +parseISO(date.slice(1))
        );
      }
      return +parseISO(date);
    });
  }
  enterBrowsingMode = () => {
    this.isBrowsing = true;
    this.resetButtonEl.classList.remove("hidden");
  };
  exitBrowsingMode = async () => {
    this.isBrowsing = false;
    this.resetButtonEl.classList.add("hidden");
    this.withoutRelayout(async () => {
      await this.plot(); // to reset xaxis to hours_to_show quickly, before refetching
      this.cache.clearCache(); // so that when the user zooms out and autoranges, not more that what's visible will be autoranged
      await this.fetch();
    });
  };
  onRestyle = async () => {
    // trace visibility changed, fetch missing traces
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    await this.fetch();
  };
  onRelayout = async () => {
    // user panned/zoomed
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    await this.fetch();
  };

  // The user supplied configuration. Throw an exception and Lovelace will
  // render an error card.
  async setConfig(config: InputConfig) {
    try {
      this.msgEl.innerText = "";
      return await this._setConfig(config);
    } catch (e: any) {
      console.error(e);
      clearTimeout(this.handles.refreshTimeout!);
      if (typeof e.message === "string") {
        this.msgEl.innerText = e.message;
      } else {
        this.msgEl.innerText = JSON.stringify(e.message || "").replace(
          /\\"/g,
          '"'
        );
      }
    }
  }
  async _setConfig(config: InputConfig) {
    config = JSON.parse(JSON.stringify(config));
    this.config = config;
    const newConfig = parseConfig(config);
    const was = this.parsed_config;
    this.parsed_config = newConfig;
    const is = this.parsed_config;
    if (is.hours_to_show !== was?.hours_to_show || is.offset !== was?.offset) {
      this.exitBrowsingMode();
    }
    await this.fetch();
  }
  fetch = async () => {
    const range = this.isBrowsing
      ? this.getVisibleRange()
      : this.getAutoFetchRange();
    for (const entity of this.parsed_config.entities) {
      if ((entity as any).autoPeriod) {
        if (isEntityIdStatisticsConfig(entity) && entity.autoPeriod) {
          entity.period = "5minute";
          const timeSpan = range[1] - range[0];
          const mapping = Object.entries(entity.autoPeriod).map(
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
            if (timeSpan >= fromMS) entity.period = aPeriod;
          }
          this.parsed_config.layout = merge(this.parsed_config.layout, {
            xaxis: { title: `Period: ${entity.period}` },
          });
        }
      }
    }
    const visibleEntities = this.parsed_config.entities.filter(
      (_, i) => this.contentEl.data[i]?.visible !== "legendonly"
    );
    while (!this.hass) await sleep(100);
    try {
      await this.cache.update(
        range,
        visibleEntities,
        this.hass,
        this.parsed_config.minimal_response,
        this.parsed_config.significant_changes_only
      );
      this.msgEl.innerText = "";
    } catch (e: any) {
      console.error(e);
      this.msgEl.innerText = JSON.stringify(e.message || "");
    }
    await this.plot();
  };
  getAllUnitsOfMeasurement() {
    const all = this.parsed_config.entities.map((entity) =>
      this.getUnitOfMeasurement(entity)
    );
    return Array.from(new Set(all));
  }
  getUnitOfMeasurement(entity: EntityConfig) {
    return (
      entity.unit_of_measurement ||
      this.hass?.states[entity.entity]?.attributes?.unit_of_measurement ||
      ""
    );
  }
  getThemedLayout() {
    const styles = window.getComputedStyle(this.contentEl);
    let haTheme = {
      "--card-background-color": "red",
      "--primary-background-color": "red",
      "--primary-color": "red",
      "--primary-text-color": "red",
      "--secondary-text-color": "red",
    };
    haTheme = mapValues(haTheme, (_, key) => styles.getPropertyValue(key));
    return getThemedLayout(
      haTheme,
      this.parsed_config.no_theme,
      this.parsed_config.no_default_layout
    );
  }

  getData(): Plotly.Data[] {
    const entities = this.parsed_config.entities;

    const units = this.getAllUnitsOfMeasurement();
    const show_value_traces: Plotly.Data[] = [];
    const real_traces: Plotly.Data[] = [];
    entities.forEach((trace, traceIdx) => {
      const entity_id = trace.entity;
      const history = this.cache.getHistory(trace);
      const attributes = this.hass?.states[entity_id]?.attributes || {};
      const unit = this.getUnitOfMeasurement(trace);
      const yaxis_idx = units.indexOf(unit);
      let name = trace.name || attributes.friendly_name || entity_id;
      if (isEntityIdAttrConfig(trace)) name += ` (${trace.attribute}) `;
      if (isEntityIdStatisticsConfig(trace)) name += ` (${trace.statistic}) `;
      const xsIn = history.map(({ timestamp }) => new Date(timestamp));
      const ysIn: Datum[] = history.map(({ value }) =>
        // see https://github.com/dbuezas/lovelace-plotly-graph-card/issues/146
        value === "unavailable" ? null : value
      );

      let xs: Datum[] = xsIn;
      let ys = ysIn;
      if (trace.extend_to_present) {
        extendLastDatapointToPresent(xs, ys, trace.offset);
      }
      if (!this.isBrowsing) {
        // to ensure the y axis autorange containst the yaxis
        removeOutOfRange(xs, ys, this.getAutoFetchRangeWithValueMargins());
      }

      if (trace.lambda) {
        try {
          const r = trace.lambda(ysIn, xsIn, history);
          if (Array.isArray(r)) {
            ys = r;
          } else {
            if (r.x) xs = r.x;
            if (r.y) ys = r.y;
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (xs.length === 0 && ys.length === 0) {
        /*
          Traces with no data are removed from the legend by plotly. 
          Setting them to have null element prevents that.
        */
        xs = [null];
        ys = [null];
      }
      const customdatum = { unit_of_measurement: unit, name, attributes };
      const customdata = xs.map((x, i) => ({ ...customdatum, x, y: ys[i] }));
      const mergedTrace = merge(
        {
          name,
          customdata,
          x: xs,
          y: ys,
          yaxis: "y" + (yaxis_idx == 0 ? "" : yaxis_idx + 1),
        },
        trace
      );
      real_traces.push(mergedTrace);
      if (mergedTrace.show_value) {
        mergedTrace.legendgroup ??= "group" + traceIdx;
        show_value_traces.push({
          texttemplate: `%{y:.2~f}%{customdata.unit_of_measurement}`, // here so it can be overwritten
          ...mergedTrace,
          mode: "text+markers",
          showlegend: false,
          hoverinfo: "skip",
          textposition: "middle right",
          marker: {
            color: mergedTrace.line!.color,
          },
          textfont: {
            color: mergedTrace.line!.color,
          },
          x: mergedTrace.x.slice(-1),
          y: mergedTrace.y.slice(-1),
        });
      }
    });
    // Preserving the original sequence of real_traces is important for `fill: tonexty`
    // https://github.com/dbuezas/lovelace-plotly-graph-card/issues/87
    return [...real_traces, ...show_value_traces];
  }

  getLayout(): Plotly.Layout {
    const units = this.getAllUnitsOfMeasurement();

    const yAxisTitles = Object.fromEntries(
      units.map((unit, i) => ["yaxis" + (i == 0 ? "" : i + 1), { title: unit }])
    );
    const layout = merge(
      {
        uirevision: this.isBrowsing
          ? this.contentEl.layout.uirevision
          : Math.random(), // to trigger the autoranges in all y-yaxes
      },
      {
        xaxis: {
          range: this.isBrowsing
            ? this.getVisibleRange()
            : this.getAutoFetchRangeWithValueMargins(),
        },
      },
      this.parsed_config.no_default_layout ? {} : yAxisTitles,
      this.getThemedLayout(),
      this.size,
      this.parsed_config.layout
    );
    return layout;
  }
  getPlotlyConfig(): Partial<Plotly.Config> {
    return {
      displaylogo: false,
      scrollZoom: true,
      modeBarButtonsToRemove: [
        "resetScale2d",
        "toImage",
        "lasso2d",
        "select2d",
      ],
      ...this.parsed_config.config,
    };
  }
  async plot() {
    if (!this.parsed_config) return;
    if (!this.hass) return;
    if (!this.isConnected) return;
    this.titleEl.innerText = this.parsed_config.title || "";
    const refresh_interval = this.parsed_config.refresh_interval;
    clearTimeout(this.handles.refreshTimeout!);
    if (refresh_interval !== "auto" && refresh_interval > 0) {
      this.handles.refreshTimeout = window.setTimeout(
        () => this.fetch(),
        refresh_interval * 1000
      );
    }
    const layout = this.getLayout();
    if (layout.paper_bgcolor) {
      this.titleEl.style.background = layout.paper_bgcolor as string;
    }
    await this.withoutRelayout(async () => {
      await Plotly.react(
        this.contentEl,
        this.getData(),
        layout,
        this.getPlotlyConfig()
      );
      this.contentEl.style.visibility = "";
    });
  }
  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns.
  getCardSize() {
    return 3;
  }
  static getStubConfig() {
    return {
      entities: [{ entity: "sun.sun" }],
      hours_to_show: 24,
      refresh_interval: 10,
    };
  }
  static async getConfigElement() {
    const { createCardElement } = await (window as any).loadCardHelpers();

    const historyGraphCard = createCardElement({
      type: "history-graph",
      ...this.getStubConfig(),
    });
    while (!historyGraphCard.constructor.getConfigElement) await sleep(100);
    return historyGraphCard.constructor.getConfigElement();
  }
}
//@ts-expect-error
window.customCards = window.customCards || [];
//@ts-expect-error
window.customCards.push({
  type: componentName,
  name: "Plotly Graph Card",
  preview: true, // Optional - defaults to false
  description: "Plotly in HA", // Optional
});

customElements.define(componentName, PlotlyGraph);
