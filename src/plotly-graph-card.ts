import { HomeAssistant } from "custom-card-helpers";
import merge from "lodash/merge";
import debounce from "lodash/debounce";
import mapValues from "lodash/mapValues";
import EventEmitter from "events";
import { version } from "../package.json";
import insertStyleHack from "./style-hack";
import Plotly from "./plotly";
import { Config } from "./types";
import { TimestampRange } from "./types";
import Cache from "./Cache";
import getThemedLayout from "./themed-layout";
import isProduction from "./is-production";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

console.info(
  `%c ${componentName.toUpperCase()} %c ${version} ${process.env.NODE_ENV}`,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);

const padding = 1;
export class PlotlyGraph extends HTMLElement {
  contentEl!: Plotly.PlotlyHTMLElement & {
    data: (Plotly.PlotData & { entity_id: string })[];
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
              top: 15px;
              left: 15px;
              display: block;
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
    this.fetch(this.getAutoFetchRange()).then(() => {
      this.contentEl.style.visibility = "";
    });
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
    const hours_to_show = this.config.hours_to_show || 1;
    const ms = Number(hours_to_show) * 60 * 60 * 1000; // if add hours is used, decimals are ignored
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
  async setConfig(config) {
    config = JSON.parse(JSON.stringify(config));

    config.entities = config.entities.map((entity) =>
      typeof entity === "string" ? { entity } : entity
    );
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

    const was = this.config;
    this.config = config;
    const is = this.config;
    if (!this.contentEl) return;
    if (is.hours_to_show !== was.hours_to_show) {
      this.exitBrowsingMode();
    }
    this.fetch(this.getAutoFetchRange());
  }
  fetch = async (range: TimestampRange) => {
    let entityNames = this.config.entities.map(({ entity }) => entity) || [];
    entityNames = entityNames.filter((entityId) =>
      this.contentEl.data.every(
        (trace) =>
          trace.entity_id !== entityId || trace.visible !== "legendonly"
      )
    );
    await this.cache.update(range, !this.isBrowsing, entityNames, this.hass);

    await this.plot();
  };
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
    return getThemedLayout(haTheme);
  }

  getData(): Plotly.Data[] {
    const entities = this.config.entities;
    const { histories, attributes } = this.cache;

    const units = Array.from(
      new Set(Object.values(attributes).map((a) => a.unit_of_measurement))
    );

    return entities.map((trace) => {
      const entity_id = trace.entity;
      const history = histories[entity_id] || {};
      const attribute = attributes[entity_id] || {};
      const unit = attribute.unit_of_measurement;
      const yaxis_idx = units.indexOf(unit);
      const name = trace.name || attribute.friendly_name || entity_id;
      return merge(
        {
          entity_id,
          name,
          hovertemplate: `<b>${name}</b><br><i>%{x}</i><br>%{y} ${unit}<extra></extra>`,
          mode: "lines",
          line: {
            width: 1,
            shape: "hv",
          },
          x: history.map(({ last_changed }) => new Date(last_changed)),
          y: history.map(({ state }) => state),
          yaxis: "y" + (yaxis_idx == 0 ? "" : yaxis_idx + 1),
        },
        trace
      );
    });
  }

  getLayout(): Plotly.Layout {
    const { attributes } = this.cache;
    const units = Array.from(
      new Set(Object.values(attributes).map((a) => a.unit_of_measurement))
    );

    const yAxisTitles = Object.fromEntries(
      units.map((unit, i) => ["yaxis" + (i == 0 ? "" : i + 1), { title: unit }])
    );

    const layout = merge(
      { uirevision: true },
      yAxisTitles,
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
    const refresh_interval = Number(this.config.refresh_interval);
    clearTimeout(this.handles.refreshTimeout!);
    if (refresh_interval > 0) {
      this.handles.refreshTimeout = window.setTimeout(
        () => this.fetch(this.getAutoFetchRange()),
        refresh_interval * 1000
      );
    }
    await this.guardRelayout(() =>
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
      entities: [{ entity: "sun.sun" }],
      hours_to_show: 24,
      refresh_interval: 10,
    };
  }
  static async getConfigElement() {
    const { createCardElement } = await (window as any).loadCardHelpers();

    const historyGraphCard = createCardElement({
      type: "history-graph",entities:['sun.sun']
    });
    while (!historyGraphCard.constructor.getConfigElement) await sleep(100)
    return historyGraphCard.constructor.getConfigElement();
  }
}
//@ts-ignore
window.customCards = window.customCards || [];
//@ts-ignore
window.customCards.push({
  type: componentName,
  name: "Plotoly Graph Card",
  preview: true, // Optional - defaults to false
  description: "Plotly in HA", // Optional
});

customElements.define(componentName, PlotlyGraph);
