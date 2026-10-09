import "./global-shim";
import { HomeAssistant } from "custom-card-helpers";
import EventEmitter from "events";
import { version } from "../package.json";
import copyPlotlyStyles from "./style-hack";
import {
  Config,
  InputConfig,
  isEntityIdAttrConfig,
  isEntityIdStateConfig,
  TouchGestures,
} from "./types";
import isProduction from "./is-production";
import "./hot-reload";
import { debounce, Delay, liveThrottle, sleep } from "./utils";
import { parseISO } from "date-fns";
import { TouchController } from "./touch-controller";
import { ConfigParser } from "./parse-config/parse-config";
import merge from "lodash/merge";
import {
  DEFAULT_PLOT_HEIGHT,
  finishInitialLoading,
  setInitialLoadingHeight,
} from "./loading-state";
import { readThemeColors } from "./parse-config/themed-layout";
import { getFetchMask } from "./plot-state";
import { inTimeZone } from "./timezone";
import { getEditorYAxisRelayout } from "./parse-config/defaults";
import { prepareHistoryLineGaps } from "./history-line-gaps";
import { StatisticsUpdates } from "./statistics-updates";
import { HistoryUpdates } from "./history-updates";
import { getEntityKey } from "./cache/Cache";
import { mapStates } from "./cache/fetch-states";
import type { StatisticsUpdatePeriod } from "./cache/statistics-refresh";

const componentName = isProduction ? "plotly-graph" : "plotly-graph-dev";

console.info(
  `%c ${componentName.toUpperCase()} %c ${version} ${process.env.NODE_ENV}`,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray",
);

export class PlotlyGraph extends HTMLElement {
  contentEl: Plotly.PlotlyHTMLElement & {
    data: (Plotly.Data & { entity: string })[];
    layout: Plotly.Layout;
  };
  errorMsgEl: HTMLElement;
  plotlyStyleEl: HTMLStyleElement;
  cardEl: HTMLElement;
  resetButtonEl: HTMLButtonElement;
  titleEl: HTMLElement;
  loadingEl: HTMLElement;
  config!: InputConfig;
  parsed_config!: Config;
  size: { width?: number; height?: number } = {};
  _hass?: HomeAssistant;
  isBrowsing = false;
  isInternalRelayout = 0;
  plotlyListenersConnected = false;
  touchController: TouchController;
  configParser = new ConfigParser();
  private statisticsFetchPeriods = new Set<StatisticsUpdatePeriod>();
  statisticsUpdates = new StatisticsUpdates((period) => {
    this.statisticsFetchPeriods.add(period);
    void this.plot({ should_fetch: false }, 500);
  });
  historyUpdates = new HistoryUpdates((states, start) => {
    let changed = false;
    for (const entity of this.configParser.historyEntities) {
      const history = mapStates(entity.entity, states[entity.entity]);
      if (!history.length) continue;
      // The stream is complete from its start, including intervals with no changes.
      this.configParser.cache.add(entity, history, [
        Math.min(start, +history[0].x),
        +history.at(-1)!.x,
      ]);
      changed = true;
    }
    if (changed)
      void this.plot({ should_fetch: false }, this.liveThrottle.change());
  });
  pausedRendering = false;
  filesFailed = false; // the browser remembers failed imports until a reload
  handles: {
    resizeObserver?: ResizeObserver;
    intersectionObserver?: IntersectionObserver;
    relayoutListener?: EventEmitter;
    restyleListener?: EventEmitter;
    refreshTimeout?: number;
    offScreenTimeout?: number;
    legendItemClick?: EventEmitter;
    legendItemDoubleclick?: EventEmitter;
    dataClick?: EventEmitter;
    doubleclick?: EventEmitter;
    annotationClick?: EventEmitter;
    buttonClick?: EventEmitter;
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
        <ha-card class="loading" aria-busy="true">
          <style>
            :host {
              display: block;
            }
            ha-card{
              display: block;
              overflow: hidden;
              position: relative;
              background: transparent;
              width: 100%;
              height: calc(100% - 5px);
              direction: ltr;
            }
            ha-card.loading {
              background: var(
                --ha-card-background,
                var(--card-background-color, var(--primary-background-color))
              );
              height: auto;
              min-height: var(--plotly-loading-height, ${DEFAULT_PLOT_HEIGHT}px);
            }
            ha-card > #plotly{
              width: 100px;
            }
            ha-card.loading > #plotly{
              min-height: var(--plotly-loading-height, ${DEFAULT_PLOT_HEIGHT}px);
              max-height: var(--plotly-loading-height, ${DEFAULT_PLOT_HEIGHT}px);
            }
            #loading {
              position: absolute;
              inset: 0;
              display: none;
              align-items: center;
              justify-content: center;
              pointer-events: none;
            }
            ha-card.loading > #loading {
              display: flex;
            }
            #loading::before {
              content: "";
              position: absolute;
              left: 27.5%;
              width: 45%;
              height: 1px;
              background: var(--divider-color, rgba(127, 127, 127, 0.25));
            }
            #loading::after {
              content: "";
              position: absolute;
              left: 27.5%;
              width: 9%;
              height: 2px;
              border-radius: 2px;
              background: linear-gradient(
                90deg,
                transparent,
                var(--primary-color) 75%,
                var(--primary-color)
              );
              filter: drop-shadow(0 0 2px var(--primary-color));
              animation: plotly-card-loading 2.2s ease-in-out infinite;
            }
            @keyframes plotly-card-loading {
              0% {
                opacity: 0;
                transform: translateX(-100%);
              }
              15%,
              85% {
                opacity: 1;
              }
              100% {
                opacity: 0;
                transform: translateX(400%);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              #loading::after {
                animation: none;
                opacity: 0.8;
                transform: translateX(180%);
              }
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
            #error-msg {
              position: absolute;
              color: #ffffff;
              top: 0;
              padding: 10px;
              width: calc(100% - 20px);
              background: rgba(203,0,0,0.8);
              overflow-wrap: break-word;
              display: none;
            }
            /* No chart (e.g. files didn't load): don't overlay, take space */
            ha-card:not(:has(.plot-container)) > #error-msg {
              position: static;
            }
            #error-msg a{
              color: mediumturquoise;
            }
          </style>
          <div id="title"> </div>
          <div id="plotly"> </div>
          <div id="loading" role="status" aria-label="Loading graph"></div>
          <span id="error-msg"> </span>
          <button id="reset" class="hidden">↻</button>
        </ha-card>`;
    this.errorMsgEl = shadow.querySelector("#error-msg")!;
    this.cardEl = shadow.querySelector("ha-card")!;
    this.contentEl = shadow.querySelector("div#plotly")!;
    this.resetButtonEl = shadow.querySelector("button#reset")!;
    this.titleEl = shadow.querySelector("ha-card > #title")!;
    this.loadingEl = shadow.querySelector("#loading")!;
    this.plotlyStyleEl = shadow.appendChild(document.createElement("style"));
    this.contentEl.style.visibility = "hidden";
    this.touchController = new TouchController({
      el: this.contentEl,
      onZoomStart: () => {
        this.pausedRendering = true;
      },
      onZoomEnd: () => {
        this.pausedRendering = false;
        if (this.isConnected) void this.plot({ should_fetch: true });
      },
    });
  }

  connectedCallback() {
    const updateCardSize = () => {
      const width = this.cardEl.offsetWidth;
      if (width <= 0) return;
      this.contentEl.style.position = "absolute";
      const height = this.cardEl.offsetHeight;
      this.contentEl.style.position = "";
      const nextSize: { width: number; height?: number } = { width };
      if (height > 100) {
        // Panel view type has the cards covering 100% of the height of the window.
        // Masonry lets the cards grow by themselves.
        // if height > 100 ==> Panel ==> use available height
        // else ==> Mansonry ==> let the height be determined by defaults
        nextSize.height = height - this.titleEl.offsetHeight;
      }
      if (
        this.size.width === nextSize.width &&
        this.size.height === nextSize.height
      )
        return;
      this.size = nextSize;
      void this.plot({ should_fetch: false });
    };
    this.handles.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      if (this.onScreen) this.catchUp();
    });
    this.handles.intersectionObserver.observe(this.cardEl);
    this.handles.resizeObserver = new ResizeObserver(updateCardSize);
    this.handles.resizeObserver.observe(this.cardEl);

    updateCardSize();
    this.resetButtonEl.addEventListener("click", this.exitBrowsingMode);
    this.touchController.connect();
    this.updateStatisticsSubscriptions();
    // Start downloading Plotly while the data is fetched (errors show on render)
    import("./plotly").catch(() => {});
    void this.plot({ should_fetch: true, refresh_statistics: true });
  }

  disconnectedCallback() {
    this.handles.resizeObserver?.disconnect();
    this.handles.intersectionObserver?.disconnect();
    this.disconnectPlotlyListeners();
    clearTimeout(this.handles.refreshTimeout!);
    clearTimeout(this.handles.offScreenTimeout);
    this.resetButtonEl.removeEventListener("click", this.exitBrowsingMode);
    this.touchController.disconnect();
    this.statisticsUpdates.disconnect();
    this.historyUpdates.disconnect();
  }

  connectPlotlyListeners() {
    if (this.plotlyListenersConnected) return;
    this.handles.relayoutListener = this.contentEl.on(
      "plotly_relayout",
      this.onRelayout,
    )!;
    this.handles.restyleListener = this.contentEl.on(
      "plotly_restyle",
      this.onRestyle,
    )!;
    this.handles.legendItemClick = this.contentEl.on(
      "plotly_legendclick",
      this.onLegendItemClick,
    )!;
    this.handles.legendItemDoubleclick = this.contentEl.on(
      "plotly_legenddoubleclick",
      this.onLegendItemDoubleclick,
    )!;
    this.handles.dataClick = this.contentEl.on(
      "plotly_click",
      this.onDataClick,
    )!;
    this.handles.doubleclick = this.contentEl.on(
      "plotly_doubleclick",
      this.onDoubleclick,
    )!;
    this.handles.annotationClick = this.contentEl.on(
      "plotly_clickannotation",
      this.onAnnotationClick,
    )!;
    this.handles.buttonClick = this.contentEl.on(
      // @ts-ignore Not properly typed in @types/plotly.js
      "plotly_buttonclicked",
      this.onButtonClick,
    )!;
    this.plotlyListenersConnected = true;
  }

  disconnectPlotlyListeners() {
    if (!this.plotlyListenersConnected) return;
    this.handles.relayoutListener?.off("plotly_relayout", this.onRelayout);
    this.handles.restyleListener?.off("plotly_restyle", this.onRestyle);
    this.handles.legendItemClick?.off(
      "plotly_legendclick",
      this.onLegendItemClick,
    );
    this.handles.legendItemDoubleclick?.off(
      "plotly_legenddoubleclick",
      this.onLegendItemDoubleclick,
    );
    this.handles.dataClick?.off("plotly_click", this.onDataClick);
    this.handles.doubleclick?.off("plotly_doubleclick", this.onDoubleclick);
    this.handles.annotationClick?.off(
      "plotly_clickannotation",
      this.onAnnotationClick,
    );
    this.handles.buttonClick?.off("plotly_buttonclicked", this.onButtonClick);
    this.plotlyListenersConnected = false;
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
      for (const entity of this.parsed_config.entities) {
        const state = hass.states[entity.entity];
        const oldState = this._hass?.states[entity.entity];
        if (state && oldState !== state) {
          shouldPlot = true;
          const end = new Date(state.last_updated);
          if (
            (isEntityIdAttrConfig(entity) || isEntityIdStateConfig(entity)) &&
            !this.historyUpdates.has(entity.entity)
          ) {
            this.configParser.cache.add(entity, [
              { state, x: new Date(end), y: null, unconfirmed: true },
            ]);
          }
        }
      }
      if (shouldPlot) {
        void this.plot({ should_fetch: false }, this.liveThrottle.change());
      }
    }
    this._hass = hass;
    this.updateStatisticsSubscriptions();
  }

  updateStatisticsSubscriptions() {
    this.statisticsUpdates.update(
      this.hass?.connection,
      this.isConnected && this.parsed_config?.refresh_interval === "auto"
        ? this.configParser.statisticsPeriods
        : new Set(),
    );
    const entities =
      this.isConnected && this.parsed_config?.refresh_interval === "auto"
        ? this.configParser.historyEntities
        : [];
    this.historyUpdates.update(
      this.hass?.connection,
      entities.map((entity) => entity.entity),
      entities.some(isEntityIdAttrConfig),
      (entityId) =>
        Math.min(
          ...entities
            .filter((entity) => entity.entity === entityId)
            .map((entity) => {
              const key = getEntityKey(entity);
              const cache = this.configParser.cache;
              const history = cache.histories[key] ?? [];
              for (let index = history.length - 1; index >= 0; index--) {
                const row = history[index];
                if (!("unconfirmed" in row && row.unconfirmed))
                  return row.x.getTime();
              }
              return cache.ranges[key]?.[0]?.[0] ?? Date.now();
            }),
        ),
    );
  }

  async withoutRelayout(fn: Function) {
    this.isInternalRelayout++;
    try {
      await fn();
    } finally {
      this.isInternalRelayout--;
    }
  }

  getVisibleRange() {
    // Plotly hands back the wall clock times it was given, in the card's time
    // zone. Known issue: with @date-fns/tz 1.5, a time inside a DST gap of the
    // browser's own zone comes back shifted (https://github.com/date-fns/tz/pull/79)
    const options = inTimeZone(this.configParser.timeZone);
    // TODO: if the x axis is not there, or is not time, don't fetch & replot
    return this.contentEl.layout.xaxis?.range?.map((date) => {
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
          2 * +parseISO("0000-01-01 00:00:00.000", options) -
          +parseISO(date.slice(1), options)
        );
      }
      return +parseISO(date, options);
    });
  }
  enterBrowsingMode = () => {
    this.isBrowsing = true;
    this.resetButtonEl.classList.remove("hidden");
  };
  exitBrowsingMode = async () => {
    this.isBrowsing = false;
    this.resetButtonEl.classList.add("hidden");
    void this.withoutRelayout(async () => {
      this.configParser.resetObservedRange();
      await this.plot({ should_fetch: true, refresh_statistics: true });
    });
  };
  onLegendItemClick = ({ curveNumber, ...rest }) => {
    return this.parsed_config.entities[curveNumber].on_legend_click({
      curveNumber,
      ...rest,
    });
  };
  onLegendItemDoubleclick = ({ curveNumber, ...rest }) => {
    return this.parsed_config.entities[curveNumber].on_legend_dblclick({
      curveNumber,
      ...rest,
    });
  };
  onDataClick = ({ points, ...rest }) => {
    return this.parsed_config.entities[points[0].curveNumber].on_click({
      points,
      ...rest,
    });
  };
  onDoubleclick = () => {
    return this.parsed_config.on_dblclick();
  };
  onAnnotationClick = ({ annotation, ...rest }) => {
    if (annotation.on_click) {
      return annotation.on_click({ annotation, ...rest });
    }
    return true;
  };
  onButtonClick = ({ button, ...rest }) => {
    if (button._input.on_click) {
      return button._input.on_click({ button, ...rest });
    }
    return true;
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
    this.config = config;
    setInitialLoadingHeight(this.cardEl, config.layout);
    void this.exitBrowsingMode();
  }
  getCSSVars() {
    const styles = window.getComputedStyle(this.contentEl);
    const cssVar = (...names: string[]) =>
      names.map((name) => styles.getPropertyValue(name).trim()).find(Boolean);
    return {
      ...readThemeColors(styles),
      // Home Assistant typography: current frontend tokens first, then the
      // legacy paper/mdc ones, then whatever the card inherits.
      "font-family":
        cssVar(
          "--ha-font-family-body",
          "--paper-font-body1_-_font-family",
          "--mdc-typography-body1-font-family",
        ) || styles.fontFamily,
      "font-size": cssVar("--ha-font-size-s") || "12px",
      "font-weight":
        cssVar(
          "--ha-font-weight-normal",
          "--paper-font-body1_-_font-weight",
          "--mdc-typography-body1-font-weight",
        ) || "400",
    };
  }
  fetchScheduled = false;
  private statisticsRefreshScheduled = false;
  plot = async (
    {
      should_fetch,
      refresh_statistics = false,
    }: {
      should_fetch: boolean;
      refresh_statistics?: boolean;
    },
    delay?: Delay,
  ) => {
    if (should_fetch || refresh_statistics) this.fetchScheduled = true;
    if (refresh_statistics) this.statisticsRefreshScheduled = true;
    await this._plot(delay);
  };
  liveThrottle = liveThrottle();
  onScreen = true;
  renderDeferred = false;
  lastRender = -Infinity;
  catchUp = () => {
    clearTimeout(this.handles.offScreenTimeout);
    if (!this.renderDeferred) return;
    this.renderDeferred = false;
    void this.plot({ should_fetch: false });
  };
  _plot = debounce(async () => {
    this.liveThrottle.renderStarted();
    if (this.pausedRendering || this.filesFailed) return;
    // Off-screen cards update every 30 s, and catch up once scrolled into
    // view. They still update, for full-page screenshots.
    const wait = this.lastRender + 30_000 - performance.now();
    if (!this.onScreen && this.parsed_config && wait > 0) {
      this.renderDeferred = true;
      clearTimeout(this.handles.offScreenTimeout);
      this.handles.offScreenTimeout = window.setTimeout(this.catchUp, wait);
      return;
    }
    this.lastRender = performance.now();
    try {
      const should_fetch = this.fetchScheduled;
      this.fetchScheduled = false;
      const refresh_statistics = this.statisticsRefreshScheduled;
      this.statisticsRefreshScheduled = false;
      const statisticsUpdates = this.statisticsFetchPeriods;
      this.statisticsFetchPeriods = new Set();
      let i = 0;
      while (!(this.config && this.hass && this.isConnected)) {
        if (i++ > 50) throw new Error("Card didn't load");
        console.log("waiting for loading");
        await sleep(100);
      }
      // Invalidate between parses, not while an older fetch is still running.
      const now = Date.now();
      if (refresh_statistics) {
        await this.configParser.cache.refreshStatistics(now);
      } else {
        for (const period of statisticsUpdates)
          await this.configParser.cache.refreshStatistics(now, period);
      }
      const fetch_mask = getFetchMask(
        this.contentEl.data,
        should_fetch || statisticsUpdates.size > 0,
      );
      const visible_range = this.isBrowsing
        ? this.getVisibleRange()
        : undefined;
      const uirevision = this.isBrowsing
        ? this.contentEl.layout?.uirevision || 0
        : Math.random();
      const yaml = merge(
        {},
        this.config,
        {
          layout: {
            ...this.size,
            uirevision,
          },
          fetch_mask,
        },
        visible_range ? { visible_range } : {},

        this.config,
      );
      const { errors, parsed } = await this.configParser.update({
        yaml,
        hass: this.hass,
        css_vars: this.getCSSVars(),
        statisticsUpdates:
          !should_fetch && statisticsUpdates.size > 0
            ? statisticsUpdates
            : undefined,
      });
      // The user moved the plot while the data loaded. That move started a
      // new render, so don't draw the old range over it.
      if (visible_range && `${this.getVisibleRange()}` !== `${visible_range}`)
        return;
      this.errorMsgEl.style.display = errors.length ? "block" : "none";
      this.errorMsgEl.innerHTML = errors
        .map((e) => "<span>" + (e || "See devtools console") + "</span>")
        .join("\n<br />\n");
      this.parsed_config = parsed;
      const touch = parsed.disable_pinch_to_zoom
        ? false
        : (parsed.extended_touch_support ?? true);
      const enabled = (gesture: keyof TouchGestures) =>
        typeof touch === "object" ? touch[gesture] !== false : touch;
      this.touchController.enabled = {
        pinch_to_zoom: enabled("pinch_to_zoom"),
        double_tap_drag_to_zoom: enabled("double_tap_drag_to_zoom"),
        hold_to_scan: enabled("hold_to_scan"),
      };
      this.updateStatisticsSubscriptions();

      const {
        entities,
        layout,
        config,
        refresh_interval,
        autorange_after_scroll,
      } = this.parsed_config;
      clearTimeout(this.handles.refreshTimeout!);
      if (refresh_interval !== "auto" && refresh_interval > 0) {
        this.handles.refreshTimeout = window.setTimeout(
          () => this.plot({ should_fetch: true, refresh_statistics: true }),
          refresh_interval * 1000,
        );
      }
      this.titleEl.innerText = this.parsed_config.title || "";
      if (layout.paper_bgcolor) {
        this.titleEl.style.background = layout.paper_bgcolor as string;
      }
      // Plotly is only downloaded once a card is drawn
      let Plotly: typeof import("./plotly").default;
      try {
        const plotly = await import("./plotly");
        const locale = await plotly.loadPlotlyModules(
          entities,
          layout,
          config.locale,
        );
        if (locale) config.locale = locale;
        Plotly = plotly.default;
      } catch (e: any) {
        this.filesFailed = true;
        this.errorMsgEl.style.display = "block";
        this.errorMsgEl.innerText = `Some files of the card didn't load (${e?.message}). If reloading doesn't help, reinstall the card (for a manual install, copy all files of the release). `;
        const reload = this.errorMsgEl.appendChild(
          document.createElement("button"),
        );
        reload.textContent = "Reload";
        reload.onclick = () => location.reload();
        return;
      }
      copyPlotlyStyles(this.plotlyStyleEl);
      this.touchController.Fx = (Plotly as any).Fx;
      await this.withoutRelayout(async () => {
        const drawnEntities = prepareHistoryLineGaps(
          entities,
          this.parsed_config.raw_plotly_config,
        );
        await Plotly.react(this.contentEl, drawnEntities, layout, config);
        if (
          autorange_after_scroll &&
          !this.parsed_config.editor_y_axis?.log_fit_bounds
        ) {
          const update = {
            "yaxis.autorange": true,
          };
          // Plotly accepts attribute paths, but its public types only list nested keys.
          await Plotly.relayout(
            this.contentEl,
            update as Partial<Plotly.Layout>,
          );
        }
        const editorUpdate = getEditorYAxisRelayout(
          this.parsed_config,
          this.contentEl.layout.yaxis?.range,
        );
        if (editorUpdate) await Plotly.relayout(this.contentEl, editorUpdate);
        this.contentEl.style.visibility = "";
      });
      if (this.isConnected) this.connectPlotlyListeners();
    } finally {
      finishInitialLoading(this.cardEl, this.loadingEl);
      this.liveThrottle.renderEnded();
    }
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
