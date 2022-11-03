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
  isEntityIdStatisticsConfig,
} from "./types";
import { TimestampRange } from "./types";
import Cache from "./cache/Cache";
import getThemedLayout from "./themed-layout";
import isProduction from "./is-production";
import { sleep } from "./utils";
import { Datum } from "plotly.js";
import colorSchemes, { isColorSchemeArray } from "./color-schemes";
import { parseISO } from "date-fns";
import {
  STATISTIC_PERIODS,
  STATISTIC_TYPES,
  StatisticPeriod,
  getIsAutoPeriodConfig,
} from "./recorder-types";
import { parseTimeDuration } from "./duration/duration";

const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

function patchLonelyDatapoints(xs: Datum[], ys: Datum[]) {
  /* Ghost traces when data has single non-unavailable states sandwiched between unavailable ones
     see: https://github.com/dbuezas/lovelace-plotly-graph-card/issues/103
  */
  for (let i = 1; i < xs.length - 1; i++) {
    if (ys[i - 1] === null && ys[i] !== null && ys[i + 1] === null) {
      ys.splice(i, 0, ys[i]);
      xs.splice(i, 0, xs[i]);
    }
  }
}

console.info(
  `%c ${componentName.toUpperCase()} %c ${version} ${process.env.NODE_ENV}`,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);

const padding = 1;
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
  hass?: HomeAssistant; // set externally
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
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <ha-card>
          <style>
            ha-card{
              padding: ${padding}px;
              height: 100%;
              box-sizing: border-box;
              background: transparent;
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
  connectedCallback() {
    this.setupListeners();
    this.fetch(this.getAutoFetchRange()).then(
      () => (this.contentEl.style.visibility = "")
    );
  }
  async withoutRelayout(fn: Function) {
    this.isInternalRelayout++;
    await fn();
    this.isInternalRelayout--;
  }
  setupListeners() {
    const updateCardSize = async () => {
      const width = this.cardEl.offsetWidth - padding * 2;
      this.contentEl.style.position = "absolute";
      const height = this.cardEl.offsetHeight - padding * 2;
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
    return [+new Date() - ms, +new Date()] as [number, number];
  }
  getVisibleRange() {
    return this.contentEl.layout.xaxis!.range!.map((date) =>
      // if autoscale is used after scrolling, plotly returns the dates as numbers instead of strings
      Number.isFinite(date) ? date : +parseISO(date)
    );
  }
  async enterBrowsingMode() {
    this.isBrowsing = true;
    this.resetButtonEl.classList.remove("hidden");
  }
  exitBrowsingMode = async () => {
    this.isBrowsing = false;
    this.resetButtonEl.classList.add("hidden");
    this.withoutRelayout(async () => {
      await Plotly.relayout(this.contentEl, {
        uirevision: Math.random(), // to trigger the autoranges in all yaxes
        xaxis: { range: this.getAutoFetchRange() },
      });
    });
    await this.fetch(this.getAutoFetchRange());
  };
  onRestyle = async () => {
    // trace visibility changed, fetch missing traces
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    await this.fetch(this.getVisibleRange());
  };
  onRelayout = async () => {
    // user panned/zoomed
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    await this.fetch(this.getVisibleRange());
  };

  // The user supplied configuration. Throw an exception and Lovelace will
  // render an error card.
  async setConfig(config: InputConfig) {
    try {
      this.msgEl.innerText = "";
      return await this._setConfig(config);
    } catch (e: any) {
      console.error(e);
      this.msgEl.innerText = JSON.stringify(e.message || "").replace(
        /\\"/g,
        '"'
      );
    }
  }
  async _setConfig(config: InputConfig) {
    config = JSON.parse(JSON.stringify(config));
    this.config = config;
    const schemeName = config.color_scheme ?? "category10";
    const colorScheme = isColorSchemeArray(schemeName)
      ? schemeName
      : colorSchemes[schemeName] ||
        colorSchemes[Object.keys(colorSchemes)[schemeName]] ||
        colorSchemes.category10;
    const newConfig: Config = {
      title: config.title,
      hours_to_show: config.hours_to_show ?? 1,
      refresh_interval: config.refresh_interval ?? 0,
      entities: config.entities.map((entityIn, entityIdx) => {
        if (typeof entityIn === "string") entityIn = { entity: entityIn };

        // being lazy on types here. The merged object is temporarily not a real Config
        const entity: any = merge(
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
        if (entity.lambda) {
          entity.lambda = window.eval(entity.lambda);
        }
        if ("statistic" in entity || "period" in entity) {
          const validStatistic = STATISTIC_TYPES.includes(entity.statistic!);
          if (!validStatistic) entity.statistic = "mean";
          console.log(entity.period);
          // @TODO: cleanup how this is done
          if (entity.period === "auto") {
            entity.autoPeriod = {
              "0": "5minute",
              "1d": "hour",
              "7d": "day",
              // "28d": "week",
              "12M": "month",
            };
          }
          const isAutoPeriodConfig = getIsAutoPeriodConfig(entity.period);

          if (isAutoPeriodConfig) {
            entity.autoPeriod = entity.period;
          }
          const validPeriod = STATISTIC_PERIODS.includes(entity.period);
          if (!validPeriod) entity.period = "hour";
        }
        const [oldAPI_entity, oldAPI_attribute] = entity.entity.split("::");
        if (oldAPI_attribute) {
          entity.entity = oldAPI_entity;
          entity.attribute = oldAPI_attribute;
        }
        return entity as EntityConfig;
      }),
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
    };

    const was = this.parsed_config;
    this.parsed_config = newConfig;
    const is = this.parsed_config;
    if (!this.contentEl) return;
    if (is.hours_to_show !== was?.hours_to_show) {
      this.exitBrowsingMode();
    }
    await this.fetch(this.getAutoFetchRange());
  }
  fetch = async (range: TimestampRange) => {
    for (const entity of this.parsed_config.entities) {
      if ((entity as any).autoPeriod) {
        if (isEntityIdStatisticsConfig(entity) && entity.autoPeriod) {
          entity.period = "5minute";
          const timeSpan = range[1] - range[0];
          const mapping = Object.entries(entity.autoPeriod)
            .map(
              ([duration, period]) =>
                [parseTimeDuration(duration as any), period] as [
                  number,
                  StatisticPeriod
                ]
            )
            .sort(([durationA], [durationB]) => durationA - durationB);

          for (const [fromMS, aPeriod] of mapping) {
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
        !this.isBrowsing,
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
      const xsIn = history.map(({ last_updated }) => new Date(last_updated));
      const ysIn: Datum[] = history.map(({ state }) =>
        state === "unavailable" ? null : state
      );

      let xs: Datum[] = xsIn;
      let ys = ysIn;
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
      patchLonelyDatapoints(xs, ys);
      const customdatum = { unit_of_measurement: unit, name, attributes };
      const customdata = xs.map(() => customdatum);
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
        if (
          typeof mergedTrace.show_value === "object" &&
          "right_margin" in mergedTrace.show_value
        ) {
          const timeMargin =
            mergedTrace.show_value.right_margin *
            ((this.parsed_config.hours_to_show * 1000 * 60 * 60) / 100);
          show_value_traces.push({
            ...mergedTrace,
            marker: {
              color: "transparent",
            },
            hoverinfo: "skip",
            showlegend: false,
            x: [new Date(Date.now() + timeMargin)],
            y: mergedTrace.y.slice(-1),
          });
        }
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
      { uirevision: true },
      {
        xaxis: {
          range: this.isBrowsing
            ? this.getVisibleRange()
            : this.getAutoFetchRange(),
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
    if (refresh_interval > 0) {
      this.handles.refreshTimeout = window.setTimeout(
        () => this.fetch(this.getAutoFetchRange()),
        refresh_interval * 1000
      );
    }
    const layout = this.getLayout();
    if (layout.paper_bgcolor) {
      this.titleEl.style.background = layout.paper_bgcolor as string;
    }
    await this.withoutRelayout(() =>
      Plotly.react(
        this.contentEl,
        this.getData(),
        layout,
        this.getPlotlyConfig()
      )
    );
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
