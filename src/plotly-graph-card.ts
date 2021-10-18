import { version } from "../package.json";
import { HomeAssistant } from "custom-card-helpers";
import insertStyleHack from "./style-hack";
import Plotly from "./plotly";
import { Config } from "./types";
import { TimestampRange } from "./types";
import Cache from "./Cache";
import merge from "lodash-es/merge";
import getThemedLayout from "./themed-layout";
import EventEmitter from "events";
import mapValues from "lodash/mapValues";
import isProduction from "./is-production";
const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

console.info(
  `%c ${componentName.toUpperCase()} %c ${version} ${process.env.NODE_ENV}`,
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
        <ha-card>
          <style>
            ha-card{
              padding: 15px;
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

      this.contentEl = this.querySelector("div#plotly")!;
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
    if (typeof config.entities[0] === "string") {
      config = {
        ...config,
        entities: config.entities.map((name) => ({ entity: name })),
      };
    }
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

    const units = Array.from(
      new Set(Object.values(attributes).map((a) => a.unit_of_measurement))
    );

    this.data = entities.map((trace, i) => {
      const entity_id = trace.entity;
      const history = histories[entity_id] || {};
      const attribute = attributes[entity_id] || {};
      const yaxis_idx = units.indexOf(attribute.unit_of_measurement);
      return {
        name: trace.name || attribute.friendly_name || entity_id,
        hovertemplate: `<b>%{x} ${attribute.unit_of_measurement}</b><br>%{y}`,
        visible: this.data[i]?.visible,
        line: {
          width: 1,
          shape: "hv",
        },
        ...trace,
        x: history.map(({ last_changed }) => new Date(last_changed)),
        y: history.map(({ state }) => state),
        yaxis: "y" + (yaxis_idx == 0 ? "" : yaxis_idx + 1),
      };
    });

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
    const units = Array.from(
      new Set(Object.values(attributes).map((a) => a.unit_of_measurement))
    );

    const yAxisTitles = Object.fromEntries(
      units.map((unit, i) => ["yaxis" + (i == 0 ? "" : i + 1), { title: unit }])
    );
    const { layout, config, width, contentEl, data } = this;

    merge(layout, yAxisTitles, this.getThemedLayout(), config.layout, {
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
    return 30;
  }
  static getStubConfig() {
    return {
      entities: [
        { entity: "sun.sun", hours_to_show: 24, refresh_interval: 10 },
      ],
    };
  }
}
customElements.define(componentName, PlotlyGraph);
