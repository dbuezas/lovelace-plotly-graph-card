import { HomeAssistant } from "custom-card-helpers";
import merge from "lodash/merge";
import mapValues from "lodash/mapValues";
import EventEmitter from "events";
import { version } from "../package.json";
import insertStyleHack from "./style-hack";
import Plotly from "./plotly";
import { Config, InputConfig } from "./types";
import { TimestampRange } from "./types";
import Cache from "./Cache";
import getThemedLayout from "./themed-layout";
import isProduction from "./is-production";
import { sleep } from "./utils";
import { Datum } from "plotly.js";
import colorSchemes from "./color-schemes";

const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

console.info(
  `%c ${componentName.toUpperCase()} %c ${version} ${process.env.NODE_ENV}`,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);

const padding = 1;
export class PlotlyGraph extends HTMLElement {
  contentEl!: Plotly.PlotlyHTMLElement & {
    data: (Plotly.PlotData & { entity: string })[];
    layout: Plotly.Layout;
  };
  cardEl!: HTMLElement;
  buttonEl!: HTMLButtonElement;
  config!: Config;
  cache = new Cache();
  size: { width?: number; height?: number } = {};
  hass!: HomeAssistant; // set externally
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
  connectedCallback() {
    if (!this.contentEl) {
      const shadow = this.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <ha-card>
          <style>
            ha-card{
              padding: ${padding}px;
              height: 100%;
              box-sizing: border-box;
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
          </style>
          <div id="plotly"> </div>
          <button id="reset" class="hidden">reset</button>
        </ha-card>`;
      this.cardEl = shadow.querySelector("ha-card")!;
      this.contentEl = shadow.querySelector("div#plotly")!;
      this.buttonEl = shadow.querySelector("button#reset")!;
      this.buttonEl.addEventListener("click", this.exitBrowsingMode);
      insertStyleHack(shadow.querySelector("style")!);
      this.contentEl.style.visibility = "hidden";
      this.withoutRelayout(() =>
        Plotly.newPlot(this.contentEl, [], { height: 10 })
      );
    }
    this.setupListeners();
    this.fetch(this.getAutoFetchRange())
      .then(() => this.fetch(this.getAutoFetchRange())) // again so home assistant extends until end of time axis
      .then(() => (this.contentEl.style.visibility = ""));
  }
  async withoutRelayout(fn: Function) {
    this.isInternalRelayout++;
    await fn();
    this.isInternalRelayout--;
  }
  setupListeners() {
    const updateCardSize = async () => {
      this.contentEl.style.position = "absolute";
      const width = this.cardEl.offsetWidth - padding * 2;
      const height =
        this.cardEl.offsetHeight -
        padding * 2 -
        // 1 pixel is left unfilled, so that something can get smaller when the
        // window changes sizes
        1;
      this.contentEl.style.position = "";
      this.size = { width };
      if (height > 100) {
        // Panel view type has the cards covering 100% of the height of the window.
        // Masonry lets the cards grow by themselves.
        // if height > 100 ==> Panel ==> use available height
        // else ==> Mansonry ==> let the height be determined by defaults
        this.size.height = height;
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
    const ms = this.config.hours_to_show * 60 * 60 * 1000;
    return [+new Date() - ms, +new Date()] as [number, number];
  }
  getVisibleRange() {
    return this.contentEl.layout.xaxis!.range!.map((date) => +new Date(date));
  }
  async enterBrowsingMode() {
    this.isBrowsing = true;
    this.buttonEl.classList.remove("hidden");
  }
  exitBrowsingMode = async () => {
    this.isBrowsing = false;
    this.buttonEl.classList.add("hidden");
    await this.fetch(this.getAutoFetchRange());
    this.withoutRelayout(async () => {
      await Plotly.relayout(this.contentEl, {
        "xaxis.autorange": true,
        "yaxis.autorange": true,
      });
      await Plotly.restyle(this.contentEl, { visible: true });
    });
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
    config = JSON.parse(JSON.stringify(config));
    const schemeName = config.color_scheme ?? "category10";
    if (config.title) {
      config = {
        ...config,
        layout: {
          margin: {
            t: 30,
          },
          legend: {
            y: -0.2,
          },
          ...config.layout,
          title: config.title,
        },
      };
    }
    const colorScheme =
      colorSchemes[schemeName] ||
      colorSchemes[Object.keys(colorSchemes)[schemeName]] ||
      colorSchemes.category10;
    const newConfig: Config = {
      hours_to_show: config.hours_to_show ?? 1,
      refresh_interval: config.refresh_interval ?? 0,

      entities: config.entities.map((entityIn, entityIdx) => {
        let entity =
          typeof entityIn === "string" ? { entity: entityIn } : entityIn;
        entity = merge(
          {
            hovertemplate: `<b>%{customdata.name}</b><br><i>%{x}</i><br>%{y}%{customdata.unit_of_measurement}<extra></extra>`,
            mode: "lines",
            line: {
              width: 1,
              shape: "hv",
              color: colorScheme[entityIdx % colorScheme.length],
            },
          },
          config.defaults?.entity,
          entity
        );

        return merge(
          entity,
          {
            show_value: entity.show_value ?? false,
          },
          { lambda: entity.lambda ? window.eval(entity.lambda) : undefined }
        );
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
        },
        config.layout
      ),
      config: {
        ...config.config,
      },
      no_theme: config.no_theme ?? false,
      no_default_layout: config.no_default_layout ?? false,
    };

    const was = this.config;
    this.config = newConfig;
    const is = this.config;
    if (!this.contentEl) return;
    if (is.hours_to_show !== was.hours_to_show) {
      this.exitBrowsingMode();
    }
    await this.fetch(this.getAutoFetchRange());
  }
  fetch = async (range: TimestampRange) => {
    let entityNames = this.config.entities.map(({ entity }) => entity) || [];
    entityNames = entityNames.filter((entityId) =>
      this.contentEl.data.every(
        (trace) => trace.entity !== entityId || trace.visible !== "legendonly"
      )
    );
    while (!this.hass) await sleep(100);
    await this.cache.update(range, !this.isBrowsing, entityNames, this.hass);
    await this.plot();
  };
  getAllUnitsOfMeasurement() {
    const all = this.config.entities.map(({ entity }) =>
      this.getUnitOfMeasurement(entity)
    );
    return Array.from(new Set(all));
  }
  getUnitOfMeasurement(entityName: string) {
    return (
      this.config.entities.find((trace) => trace.entity === entityName)
        ?.unit_of_measurement ||
      this.cache.attributes[entityName]?.unit_of_measurement ||
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
      this.config.no_theme,
      this.config.no_default_layout
    );
  }

  getData(): Plotly.Data[] {
    const entities = this.config.entities;
    const { histories, attributes } = this.cache;

    const units = this.getAllUnitsOfMeasurement();

    return entities.flatMap((trace, traceIdx) => {
      const entity_id = trace.entity;
      const history = histories[entity_id] || [];
      const attribute = attributes[entity_id] || {};
      const unit = this.getUnitOfMeasurement(entity_id);
      const yaxis_idx = units.indexOf(unit);
      const name = trace.name || attribute.friendly_name || entity_id;
      const xsIn = history.map(({ last_changed }) => new Date(last_changed));
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
      const traces: Plotly.Data[] = [mergedTrace];
      if (mergedTrace.show_value) {
        merge(mergedTrace, {
          legendgroup: "group" + traceIdx,
        });
        traces.push({
          // @ts-expect-error (texttemplate missing in plotly typings)
          texttemplate: `%{y}%{customdata.unit_of_measurement}`, // here so it can be overwritten
          ...mergedTrace,
          mode: "text+markers",
          legendgroup: "group" + traceIdx,
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
            ((this.config.hours_to_show * 1000 * 60 * 60) / 100);
          traces.push({
            ...mergedTrace,
            legendgroup: "group" + traceIdx,
            marker: {
              color: "transparent",
            },
            hoverinfo: "skip",
            showlegend: false,
            x: [+Date.now() + timeMargin],
            y: mergedTrace.y.slice(-1),
          });
        }
      }
      return traces;
    });
  }

  getLayout(): Plotly.Layout {
    const { attributes } = this.cache;
    const units = this.getAllUnitsOfMeasurement();

    const yAxisTitles = Object.fromEntries(
      units.map((unit, i) => ["yaxis" + (i == 0 ? "" : i + 1), { title: unit }])
    );

    const layout = merge(
      { uirevision: true },
      this.config.no_default_layout ? {} : yAxisTitles,
      this.getThemedLayout(),
      this.size,
      this.config.layout
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
      ...this.config.config,
    };
  }
  async plot() {
    if (!this.config) return;
    if (!this.hass) return;
    if (!this.isConnected) return;
    const refresh_interval = this.config.refresh_interval;
    clearTimeout(this.handles.refreshTimeout!);
    if (refresh_interval > 0) {
      this.handles.refreshTimeout = window.setTimeout(
        () => this.fetch(this.getAutoFetchRange()),
        refresh_interval * 1000
      );
    }
    await this.withoutRelayout(() =>
      Plotly.react(
        this.contentEl,
        this.getData(),
        this.getLayout(),
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
      entities: [{ entity: "sun.sun::elevation" }],
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
//@ts-ignore
window.customCards = window.customCards || [];
//@ts-ignore
window.customCards.push({
  type: componentName,
  name: "Plotly Graph Card",
  preview: true, // Optional - defaults to false
  description: "Plotly in HA", // Optional
});

customElements.define(componentName, PlotlyGraph);
