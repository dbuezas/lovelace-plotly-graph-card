import { version } from "../package.json";
import { HomeAssistant } from "custom-card-helpers";
import insertStyleHack from "./styleHack";
import Plotly from "./plotly";
import { Config } from "./types";
import { TimestampRange } from "./types";
import Cache from "./Cache";
import merge from "lodash-es/merge";
import * as themes from "./themes";
import EventEmitter from "events";

import autorange from "./autorange";

console.info(
  `%c PLOTLY-GRAPH-CARD %c ${version} `,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);

export class PlotlyGraph extends HTMLElement {
  contentEl!: HTMLDivElement;
  buttonEl!: HTMLButtonElement;
  config!: Config;
  layout: Partial<Plotly.Layout> = {};
  cache = new Cache();
  data: Partial<Plotly.PlotData>[] = [];
  width = 1;
  hass!: HomeAssistant; // set externally
  isBrowsing = false;
  isInternalRelayout = false;
  handles: {
    resizeObserver?: ResizeObserver;
    relayoutListener?: EventEmitter;
    refreshTimeout?: number;
  } = {};
  disconnectedCallback() {
    this.handles.resizeObserver!.disconnect();
    this.handles.relayoutListener!.off("plotly_relayout", this.zoomCallback);
    clearTimeout(this.handles.refreshTimeout!);
  }
  connectedCallback() {
    if (!this.contentEl) {
      this.innerHTML = `
        <style>
          button#reset.hidden{
            display: none;
          }
          button#reset {
            position: absolute;
            top: 10px;
            display: block;
          }
        </style>
        <div> </div>
        <button id="reset" class="hidden">reset</button>`;
      this.contentEl = this.querySelector("div")!;
      this.buttonEl = this.querySelector("button#reset")!;
      this.buttonEl.addEventListener("click", this.exitBrowsingMode);
      insertStyleHack(this.querySelector("style")!);
    }
    this.setupListeners();
    this.update(this.getXRange());
  }
  setupListeners() {
    const updateWidth = () => {
      this.width = this.contentEl!.offsetWidth;
      this.plot();
    };
    this.handles.resizeObserver = new ResizeObserver(updateWidth);
    this.handles.resizeObserver.observe(this.contentEl);

    updateWidth();
    this.handles.relayoutListener = (this.contentEl as any).on(
      "plotly_relayout",
      this.zoomCallback
    );
  }
  getXRange() {
    const hours_to_show = this.config.hours_to_show || 1;
    const ms = Number(hours_to_show) * 60 * 60 * 1000; // if add hours is used, decimals are ignored
    return [+new Date() - ms, +new Date()] as [number, number];
  }
  enterBrowsingMode() {
    this.isBrowsing = true;
    this.buttonEl.classList.remove("hidden");
    // Plotly.relayout(this.contentEl, {
    //   "xaxis.autorange": false,
    //   "yaxis.autorange": false,
    // });
  }
  exitBrowsingMode = async () => {
    this.isBrowsing = false;
    this.buttonEl.classList.add("hidden");
    this.isInternalRelayout = true;
    await Plotly.relayout(this.contentEl, {
      "xaxis.autorange": true,
      "yaxis.autorange": true,
    });
    this.update(this.getXRange());
    this.isInternalRelayout = false;
  };
  zoomCallback = (eventdata) => {
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    if (eventdata["xaxis.range[0]"]) {
      const range: TimestampRange = [
        +new Date(eventdata["xaxis.range[0]"]),
        +new Date(eventdata["xaxis.range[1]"]),
      ];
      this.update(range);
    }
  };

  // The user supplied configuration. Throw an exception and Lovelace will
  // render an error card.
  async setConfig(config) {
    const was = this.config;
    this.config = JSON.parse(JSON.stringify(config));
    const is = this.config;
    if (!this.contentEl) return;
    if (is.hours_to_show !== was.hours_to_show) {
      this.exitBrowsingMode();
    }
    this.update(this.getXRange());
  }
  update = async (range: TimestampRange) => {
    const entityNames = this.config.entities.map(({ entity }) => entity) || [];

    await this.cache.update(range, !this.isBrowsing, entityNames, this.hass);
    const entities = this.config.entities;
    const { histories, attributes } = this.cache;

    this.data = entities.map((trace) => {
      const entity_id = trace.entity;
      const history = histories[entity_id] || {};
      const attribute = attributes[entity_id] || {};
      return {
        name: trace.name || attribute.friendly_name || entity_id,
        hovertemplate: `%{y} ${attribute.unit_of_measurement || ""}`,
        ...trace,
        x: history.map(({ last_changed }) => new Date(last_changed)),
        y: history.map(({ state }) => state),
      };
    });

    await this.plot();
  };
  async plot() {
    if (!this.config) return;
    if (!this.hass) return;
    if (!this.isConnected) return;
    const refresh_interval = Number(this.config.refresh_interval);
    clearTimeout(this.handles.refreshTimeout!);
    if (refresh_interval > 0) {
      this.handles.refreshTimeout = window.setTimeout(
        () => this.update(this.getXRange()),
        refresh_interval * 1000
      );
    }
    const { attributes } = this.cache;
    const unit = Object.values(attributes).map(
      ({ unit_of_measurement }) => unit_of_measurement
    )[0];
    const { layout, config, width, contentEl, data } = this;
    const themeLayout = themes[config.theme!] || themes.dark;
    merge(layout, { yaxis: { title: unit } }, themeLayout, config.layout, {
      width,
    });
    const plotlyConfig: Partial<Plotly.Config> = {
      displaylogo: false,
      modeBarButtonsToRemove: ["resetScale2d", "toImage"],
      ...config.config,
    };
    this.isInternalRelayout = true;
    await Plotly.react(contentEl, data, layout, plotlyConfig);
    this.isInternalRelayout = false;
  }
  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns.
  getCardSize() {
    return 3;
  }
}

customElements.define("plotly-graph", PlotlyGraph);
