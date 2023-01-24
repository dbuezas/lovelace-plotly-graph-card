import { HomeAssistant } from "custom-card-helpers";
import EventEmitter from "events";
import mapValues from "lodash/mapValues";
import { version } from "../package.json";
import insertStyleHack from "./style-hack";
import Plotly from "./plotly";
import {
  Config,
  InputConfig,
  isEntityIdAttrConfig,
  isEntityIdStateConfig,
  isEntityIdStatisticsConfig,
} from "./types";
import isProduction from "./is-production";
import { debounce, sleep } from "./utils";
import { parseISO } from "date-fns";
import { TouchController } from "./touch-controller";
import { ConfigParser } from "./parse-config/parse-config";
import { merge } from "lodash";

const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

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
  size: { width?: number; height?: number } = {};
  _hass?: HomeAssistant;
  isBrowsing = false;
  isInternalRelayout = 0;
  touchController: TouchController;
  configParser = new ConfigParser();
  pausedRendering = false;
  handles: {
    resizeObserver?: ResizeObserver;
    relayoutListener?: EventEmitter;
    restyleListener?: EventEmitter;
    refreshTimeout?: number;
  } = {};

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
    insertStyleHack(shadow.querySelector("style")!);
    this.contentEl.style.visibility = "hidden";
    this.touchController = new TouchController({
      el: this.contentEl,
      onZoomStart: () => {
        this.pausedRendering = true;
      },
      onZoomEnd: () => {
        this.pausedRendering = false;
        this.plot({ should_fetch: true });
      },
    });
    this.withoutRelayout(() => Plotly.newPlot(this.contentEl, [], {}));
  }

  connectedCallback() {
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
      this.plot({ should_fetch: false });
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
    this.resetButtonEl.addEventListener("click", this.exitBrowsingMode);
    this.touchController.connect();
    this.plot({ should_fetch: true });
  }

  disconnectedCallback() {
    this.handles.resizeObserver!.disconnect();
    this.handles.relayoutListener!.off("plotly_relayout", this.onRelayout);
    this.handles.restyleListener!.off("plotly_restyle", this.onRestyle);
    clearTimeout(this.handles.refreshTimeout!);
    this.resetButtonEl.removeEventListener("click", this.exitBrowsingMode);
    this.touchController.disconnect();
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
      let should_fetch = false;
      for (const entity of this.parsed_config.entities) {
        const state = hass.states[entity.entity];
        const oldState = this._hass?.states[entity.entity];
        if (state && oldState !== state) {
          shouldPlot = true;
          const start = new Date(oldState?.last_updated || state.last_updated);
          const end = new Date(state.last_updated);
          const range: [number, number] = [+start, +end];
          let shouldAddToCache = false;
          if (isEntityIdAttrConfig(entity)) {
            shouldAddToCache = true;
          } else if (isEntityIdStateConfig(entity)) {
            shouldAddToCache = true;
          } else if (isEntityIdStatisticsConfig(entity)) {
            should_fetch = true;
          }

          if (shouldAddToCache) {
            this.configParser.cache.add(
              entity,
              [{ state, x: new Date(end), y: null }],
              range
            );
          }
        }
      }
      if (shouldPlot) {
        this.plot({ should_fetch }, 500);
      }
    }
    this._hass = hass;
  }

  async withoutRelayout(fn: Function) {
    this.isInternalRelayout++;
    await fn();
    this.isInternalRelayout--;
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
      this.configParser.resetObservedRange();
      await this.plot({ should_fetch: true });
    });
  };
  onRestyle = async () => {
    // trace visibility changed, fetch missing traces
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    await this.plot({ should_fetch: true });
  };
  onRelayout = async () => {
    // user panned/zoomed
    if (this.isInternalRelayout) return;
    this.enterBrowsingMode();
    await this.plot({ should_fetch: true });
  };

  // The user supplied configuration. Throw an exception and Lovelace will
  // render an error card.
  async setConfig(config: InputConfig) {
    try {
      this.msgEl.innerText = "";
      this.config = config;
      await this.plot({ should_fetch: false });
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
  // async _setConfig(config: InputConfig) {
  //   config = JSON.parse(JSON.stringify(config));
  //   this.config = config;
  //   const newConfig = parseConfig(config);
  //   const was = this.parsed_config;
  //   this.parsed_config = newConfig;
  //   const is = this.parsed_config;
  //   this.touchController.isEnabled = !is.disable_pinch_to_zoom;
  //   if (is.hours_to_show !== was?.hours_to_show || is.offset !== was?.offset) {
  //     this.exitBrowsingMode();
  //   } else {
  //     await this.fetch();
  //   }
  // }
  getCSSVars() {
    const styles = window.getComputedStyle(this.contentEl);
    let haTheme = {
      "--card-background-color": "red",
      "--primary-background-color": "red",
      "--primary-color": "red",
      "--primary-text-color": "red",
      "--secondary-text-color": "red",
    };
    return mapValues(haTheme, (_, key) => styles.getPropertyValue(key));
  }
  fetchScheduled = false;
  plot = async (
    { should_fetch }: { should_fetch: boolean },
    delay?: number
  ) => {
    if (should_fetch) this.fetchScheduled = true;
    await this._plot(delay);
  };
  _plot = debounce(async () => {
    if (this.pausedRendering) return;
    const should_fetch = this.fetchScheduled;
    this.fetchScheduled = false;
    while (!(this.config && this.hass && this.isConnected)) {
      console.log("waiting for loading");
      await sleep(100);
    }
    const fetch_mask = this.contentEl.data.map(
      ({ visible }) => should_fetch && visible !== "legendonly"
    );
    const raw_config = merge(
      {},
      this.config,
      { layout: this.size },
      { fetch_mask },
      this.isBrowsing ? { visible_range: this.getVisibleRange() } : {},
      this.config
    );
    this.parsed_config = await this.configParser.update({
      raw_config,
      hass: this.hass,
      cssVars: this.getCSSVars(),
    });
    // console.log("fetched", this.parsed_config);

    const { entities, layout, config, refresh_interval } = this.parsed_config;
    clearTimeout(this.handles.refreshTimeout!);
    if (refresh_interval !== "auto" && refresh_interval > 0) {
      this.handles.refreshTimeout = window.setTimeout(
        () => this.plot({ should_fetch: true }),
        refresh_interval * 1000
      );
    }
    this.titleEl.innerText = this.parsed_config.title || "";
    if (layout.paper_bgcolor) {
      this.titleEl.style.background = layout.paper_bgcolor as string;
    }
    await this.withoutRelayout(async () => {
      await Plotly.react(this.contentEl, entities, layout, config);
      this.contentEl.style.visibility = "";
    });
    console.log("plotted");
  });
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
