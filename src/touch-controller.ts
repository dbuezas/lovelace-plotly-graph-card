import { Layout, LayoutAxis } from "plotly.js";
import PlotlyRuntime from "./plotly";

type PlotlyEl = Plotly.PlotlyHTMLElement & {
  data: (Plotly.Data & { entity: string })[];
  layout: Plotly.Layout;
};
type PlotlyEmitter = PlotlyEl & {
  removeListener: (event: string, listener: (...args: never[]) => unknown) => void;
};
type TouchDragMode = "plotly" | "hover";

const zoomedRange = (axis: Partial<LayoutAxis>, zoom: number) => {
  if (!axis || !axis.range) return undefined;
  const center = (+axis.range[1] + +axis.range[0]) / 2;
  if (isNaN(center)) return undefined; // probably a categorical axis. Don't zoom
  const radius = (+axis.range[1] - +axis.range[0]) / zoom / 2;
  return [center - radius, center + radius];
};
const ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD = 250;
const MIN_TOUCH_DRAG_PX = 8; // Plotly's own minimum drag distance.
const movedPastThreshold = (
  start: { x: number; y: number },
  touch: Touch,
) => Math.max(
  Math.abs(touch.clientX - start.x),
  Math.abs(touch.clientY - start.y),
) >= MIN_TOUCH_DRAG_PX;
const TOUCH_HOVER_ATTR = "touchHover";
const HOVER_LABEL_SELECTOR =
  ".hoverlayer .hovertext, .hoverlayer .axistext, .hoverlayer .legend";

export class TouchController {
  isEnabled = true;
  touchDragMode: TouchDragMode = "plotly";
  touchHoverEnabled = false;
  private touchTooltipArmed = false;
  private readonly touchInputEvents = new WeakSet<Event>();
  // Plotly compares config callbacks by identity; keep this stable across react
  // so native dragmode and legend UI state can be preserved.
  private readonly touchHoverButton = {
    name: TOUCH_HOVER_ATTR,
    title: "Scan",
    icon: PlotlyRuntime.Icons.tooltip_basic,
    attr: TOUCH_HOVER_ATTR,
    toggle: true,
    click: () => this.setTouchDragMode("hover"),
  };
  lastTouches?: TouchList;
  clientX = 0;
  clientY = 0;
  lastSingleTouchTimestamp = 0;
  private lastSingleTouchMode: TouchDragMode = "plotly";
  private singleFingerStart?: { x: number; y: number };
  private singleFingerDragged = false;
  hoverStart?: { x: number; y: number };
  private hoverTarget?: SVGRectElement;
  // Only contacts whose starts we suppressed, including consumed replacement targets.
  private hoverContacts = new Map<number, EventTarget>();
  // The pinch pause lasts through the consumed remainder, not just zoom moves.
  private hoverZooming = false;
  elRect?: DOMRect;
  el: PlotlyEl;
  onZoomStart: () => any;
  onZoomEnd: () => any;
  state: "hover" | "hover pinch" | "hover consumed" | "tooltip dismiss" | "one finger" | "two fingers" | "idle" = "idle";
  constructor(param: {
    el: PlotlyEl;
    onZoomStart: () => any;
    onZoomEnd: () => any;
  }) {
    this.el = param.el;
    this.onZoomStart = param.onZoomStart;
    this.onZoomEnd = param.onZoomEnd;
  }
  disconnect() {
    this.finishHover();
    this.touchTooltipArmed = false;
    const emitter = this.el as PlotlyEmitter;
    emitter.removeListener("plotly_click", this.onPlotlyClick);
    emitter.removeListener("plotly_hover", this.onPlotlyHover);
    emitter.removeListener("plotly_unhover", this.onPlotlyUnhover);
    this.el.removeEventListener("touchmove", this.onTouchMove);
    this.el.removeEventListener("touchstart", this.onTouchStart);
    this.el.removeEventListener("touchend", this.onTouchEnd);
    this.el.removeEventListener("touchcancel", this.onTouchCancel, true);
    this.el.removeEventListener("click", this.onModeBarClick);
  }
  connect() {
    this.el.on("plotly_click", this.onPlotlyClick);
    this.el.on("plotly_hover", this.onPlotlyHover);
    this.el.on("plotly_unhover", this.onPlotlyUnhover);
    this.el.addEventListener("touchmove", this.onTouchMove, {
      capture: true,
    });
    this.el.addEventListener("touchstart", this.onTouchStart, {
      capture: true,
    });
    this.el.addEventListener("touchend", this.onTouchEnd, {
      capture: true,
    });
    this.el.addEventListener("touchcancel", this.onTouchCancel, {
      capture: true,
    });
    this.el.addEventListener("click", this.onModeBarClick);
  }

  setTouchDragMode(mode: TouchDragMode) {
    if (mode !== this.touchDragMode) this.lastSingleTouchTimestamp = 0;
    this.touchDragMode = mode;
    queueMicrotask(() => this.syncModeBarState());
  }

  withTouchHoverModeBar(
    config: Partial<Plotly.Config>,
  ): Partial<Plotly.Config> {
    if (!navigator.maxTouchPoints) return config;
    const button = this.touchHoverButton;
    if (Array.isArray(config.modeBarButtons) && config.modeBarButtons.length)
      return {
        ...config,
        modeBarButtons: [...config.modeBarButtons, [button]],
      };
    const additions = config.modeBarButtonsToAdd || [];
    return {
      ...config,
      // Plotly also accepts grouped additions; its public types only list flat ones.
      modeBarButtonsToAdd: [
        ...additions,
        Array.isArray(additions[0]) ? [button] : button,
      ] as Plotly.Config["modeBarButtonsToAdd"],
    };
  }

  syncModeBarState() {
    const button = this.el.querySelector<HTMLButtonElement>(
      `.modebar-btn[data-attr="${TOUCH_HOVER_ATTR}"]`,
    );
    if (!button) return;
    const supported = this.touchHoverEnabled
      && navigator.maxTouchPoints > 0
      && !!this.getMainDragger();
    button.style.display = supported ? "" : "none";
    button.classList.toggle(
      "active",
      supported && this.touchDragMode === "hover",
    );
    const icon = button.querySelector<SVGPathElement>(".icon path");
    // Plotly writes inline fill, including when its toggle handler runs after us.
    const colors = (this.el as any)._fullLayout.modebar;
    if (icon) icon.style.fill = button.classList.contains("active") || button.matches(":hover")
      ? colors.activecolor : colors.color;

    // Touch Hover is an alternative to the Cartesian drag tools for touch input,
    // but it deliberately leaves layout.dragmode unchanged for mouse input.
    // Reflect that mutual exclusivity visually without changing Plotly's state.
    if (supported && this.touchDragMode === "hover") {
      this.el.querySelectorAll<HTMLButtonElement>(
        '.modebar-btn[data-attr="dragmode"]',
      ).forEach(nativeButton => {
        nativeButton.classList.remove("active");
        const nativeIcon =
          nativeButton.querySelector<SVGPathElement>(".icon path");
        if (nativeIcon && !nativeButton.matches(":hover"))
          nativeIcon.style.fill = colors.color;
      });
    }
  }

  onModeBarClick = (e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".modebar-btn");
    if (!button) return;
    if (button.matches('[data-attr$="dragmode"]')) {
      this.lastSingleTouchTimestamp = 0;
      this.setTouchDragMode("plotly");
    } else if (this.touchDragMode === "hover")
      // Plotly refreshes all active classes after any modebar action.
      queueMicrotask(() => this.syncModeBarState());
  };

  captureTouch(e: TouchEvent) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  getMainDragger() {
    return this.el.querySelector<SVGRectElement>(".nsewdrag.drag");
  }

  isMainDraggerEvent(e: TouchEvent) {
    const dragger = this.getMainDragger();
    return !!dragger && e.composedPath().includes(dragger);
  }

  isHoverLabelTouch(touch: Touch) {
    return this.hoverLabelRects().some(r =>
      touch.clientX >= r.left && touch.clientX <= r.right
      && touch.clientY >= r.top && touch.clientY <= r.bottom
    );
  }

  private hoverLabelRects() {
    return [...this.el.querySelectorAll<SVGElement>(HOVER_LABEL_SELECTOR)]
      .filter(label => getComputedStyle(label).visibility !== "hidden")
      .map(label => label.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0);
  }

  private isTouchInputEvent(event: MouseEvent) {
    const touchEvent = event as MouseEvent & Partial<TouchEvent>;
    return this.touchInputEvents.has(event)
      || !!touchEvent.touches || !!touchEvent.changedTouches;
  }

  private onPlotlyClick = ({ event }: Plotly.PlotMouseEvent) => {
    this.touchTooltipArmed = this.isTouchInputEvent(event)
      && this.hoverLabelRects().length > 0;
  };

  private onPlotlyHover = ({ event }: Plotly.PlotHoverEvent) => {
    if (this.isTouchInputEvent(event))
      this.touchTooltipArmed = this.hoverLabelRects().length > 0;
    else this.touchTooltipArmed = false;
  };

  private onPlotlyUnhover = () => {
    this.touchTooltipArmed = false;
  };

  private finishHover() {
    if (!this.hoverTarget) return;
    for (const target of this.hoverContacts.values()) {
      target.removeEventListener("touchend", this.onDetachedCompletion as EventListener);
      target.removeEventListener("touchcancel", this.onDetachedCompletion as EventListener);
    }
    this.hoverContacts.clear();
    this.hoverTarget = undefined;
    this.hoverStart = undefined;
    this.lastTouches = undefined;
    this.state = "idle";
    const zooming = this.hoverZooming;
    this.hoverZooming = false;
    if (zooming) this.onZoomEnd();
  }

  private onDetachedCompletion = (e: TouchEvent) => {
    // Connected events are stopped at the plot's capture listener. A removed
    // dragger still receives its touches, but neither the plot nor document does.
    if (this.el.contains(e.currentTarget as Node)) return;
    this.hoverStart = undefined;
    this.state = "hover consumed";
    this.completeHover(e);
  };

  private acquireHover(touches: TouchList) {
    for (const touch of touches) {
      this.hoverContacts.set(touch.identifier, touch.target);
      touch.target.addEventListener("touchend", this.onDetachedCompletion as EventListener);
      touch.target.addEventListener("touchcancel", this.onDetachedCompletion as EventListener);
    }
  }

  private completeHover(e: TouchEvent) {
    for (const touch of e.changedTouches) {
      const target = this.hoverContacts.get(touch.identifier);
      this.hoverContacts.delete(touch.identifier);
      if (target && ![...this.hoverContacts.values()].includes(target)) {
        target.removeEventListener("touchend", this.onDetachedCompletion as EventListener);
        target.removeEventListener("touchcancel", this.onDetachedCompletion as EventListener);
      }
    }
    if (!this.hoverContacts.size) this.finishHover();
    else {
      this.hoverStart = undefined;
      this.state = "hover consumed";
    }
  }

  private continueHover(e: TouchEvent) {
    const target = this.hoverTarget;
    if (!target) return false;
    if (e.type === "touchstart" && this.isMainDraggerEvent(e))
      this.acquireHover(e.changedTouches);
    if (![...e.changedTouches].some(t => this.hoverContacts.has(t.identifier))) {
      // Observe native surfaces without stealing their events or entering the
      // upstream state machine while an owned gesture still needs completion.
      this.hoverStart = undefined;
      this.state = "hover consumed";
      return true;
    }
    this.captureTouch(e);
    const local = [...e.touches].filter((t) => t.target === target);
    const ending = e.type === "touchend" || e.type === "touchcancel";
    const tap = e.type === "touchend"
      && (this.state === "hover" || this.state === "tooltip dismiss")
      && this.hoverStart && e.touches.length === 0 && e.changedTouches.length === 1
      && this.el.contains(target) && e.changedTouches[0].target === target;
    const dismissTooltip = tap && this.state === "tooltip dismiss";
    const hoverTap = tap && this.state === "hover";
    if (ending) {
      const touch = e.changedTouches[0];
      this.completeHover(e);
      if (dismissTooltip) this.clearHover();
      else if (tap) {
        if (hoverTap) {
          this.lastSingleTouchTimestamp = Date.now();
          this.lastSingleTouchMode = "hover";
        }
        this.dispatchPlotlyTap(touch);
      }
    } else if (this.state !== "hover consumed") {
      if (!this.el.contains(target) || local.length !== e.touches.length || local.length > 2) {
        this.hoverStart = undefined;
        this.state = "hover consumed";
      } else if (local.length === 2) {
        this.hoverStart = undefined;
        if (this.state === "hover" && e.type === "touchstart" && this.isEnabled) {
          this.clearHover();
          this.lastTouches = e.touches;
          this.clientX = (local[0].clientX + local[1].clientX) / 2;
          this.clientY = (local[0].clientY + local[1].clientY) / 2;
          this.state = "hover pinch";
          this.hoverZooming = true;
          this.onZoomStart();
        } else if (
          this.state === "hover pinch" &&
          e.type === "touchmove" &&
          this.isEnabled
        ) {
          this.handleTwoFingersZoom(e);
        } else {
          this.state = "hover consumed";
        }
      } else if (local.length === 1 && this.state === "hover" && e.type === "touchmove") {
        const touch = local[0];
        if (this.hoverStart && movedPastThreshold(this.hoverStart, touch))
          this.hoverStart = undefined;
        this.scrubHover(touch);
      } else if (local.length === 1 && this.state === "tooltip dismiss" && e.type === "touchmove") {
        const touch = local[0];
        if (this.hoverStart && movedPastThreshold(this.hoverStart, touch)) {
          this.hoverStart = undefined;
          this.state = "hover consumed";
        }
      } else if (this.state === "hover pinch") {
        this.state = "hover consumed";
      }
    }
    return true;
  }

  mouseEvent(type: string, touch: Touch, buttons = 0) {
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons,
    });
  }

  scrubHover(touch: Touch) {
    const event = this.mouseEvent("mousemove", touch);
    this.touchInputEvents.add(event);
    this.getMainDragger()?.dispatchEvent(event);
  }

  clearHover() {
    this.touchTooltipArmed = false;
    // Fx is exported at runtime but omitted from Plotly's public TypeScript API.
    (PlotlyRuntime as any).Fx.unhover(this.el);
  }

  dispatchPlotlyTap(touch: Touch) {
    const dragger = this.getMainDragger();
    if (!dragger) return;
    const down = this.mouseEvent("mousedown", touch, 1);
    this.touchInputEvents.add(down);
    dragger.dispatchEvent(down);
    this.el.ownerDocument.dispatchEvent(this.mouseEvent("mouseup", touch));
    // Plotly copies the initiating event before emitting plotly_click, so the
    // WeakSet identity above cannot identify this synthetic touch translation.
    this.touchTooltipArmed = this.hoverLabelRects().length > 0;
  }

  private startSingleFingerZoom(e: TouchEvent) {
    const stateWas = this.state;
    this.lastSingleTouchTimestamp = 0;
    if (this.touchTooltipArmed) this.clearHover();
    e.stopPropagation();
    e.stopImmediatePropagation();
    this.state = "one finger";
    this.clientX = e.touches[0].clientX;
    this.clientY = e.touches[0].clientY;
    this.singleFingerStart = { x: this.clientX, y: this.clientY };
    this.singleFingerDragged = false;
    this.lastTouches = e.touches;
    this.elRect = this.el.getBoundingClientRect();
    if (stateWas === "idle") this.onZoomStart();
  }

  onTouchStart = async (e: TouchEvent) => {
    if (this.continueHover(e)) return;
    const mainDragger = this.getMainDragger();
    const mainDraggerEvent = !!mainDragger
      && e.composedPath().includes(mainDragger);
    // Custom double-tap zoom belongs to the Cartesian plot surface. An
    // intervening native-surface touch also ends any pending plot tap sequence.
    if (e.touches.length === 1 && !mainDraggerEvent)
      this.lastSingleTouchTimestamp = 0;
    const touchMode = this.touchHoverEnabled && this.touchDragMode === "hover"
      ? "hover" : "plotly";
    if (this.isEnabled && e.touches.length === 1
      && Date.now() - this.lastSingleTouchTimestamp
        < ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD
      && this.lastSingleTouchMode === touchMode
      && mainDraggerEvent) {
      this.startSingleFingerZoom(e);
      return;
    }
    if (e.touches.length === 1 && this.touchTooltipArmed
      && mainDraggerEvent && this.isHoverLabelTouch(e.touches[0])) {
      const touch = e.touches[0];
      this.captureTouch(e);
      this.lastSingleTouchTimestamp = 0;
      this.hoverTarget = mainDragger!;
      this.acquireHover(e.changedTouches);
      this.state = "tooltip dismiss";
      this.hoverStart = { x: touch.clientX, y: touch.clientY };
      return;
    }
    if (touchMode === "hover" && e.touches.length === 1) {
      // In Touch Hover mode, axes and Plotly overlays remain fully native.
      if (!mainDraggerEvent) return;
      const touch = e.touches[0];
      this.captureTouch(e);
      this.lastSingleTouchTimestamp = 0;
      this.hoverTarget = mainDragger!;
      this.acquireHover(e.changedTouches);
      this.state = "hover";
      this.hoverStart = { x: touch.clientX, y: touch.clientY };
      this.scrubHover(touch);
      return;
    }
    if (!this.isEnabled) return;

    const stateWas = this.state;
    this.state = "idle";
    if (e.touches.length == 1 && mainDraggerEvent) {
      this.lastSingleTouchTimestamp = Date.now();
      this.lastSingleTouchMode = "plotly";
    } else if (e.touches.length == 2) {
      this.lastSingleTouchTimestamp = 0;
      this.state = "two fingers";
      this.lastTouches = e.touches;
      this.clientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      this.clientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }

    if (stateWas === "idle" && stateWas !== this.state) {
      this.onZoomStart();
    }
  };

  onTouchMove = async (e: TouchEvent) => {
    if (this.continueHover(e)) return;

    if (!this.isEnabled) return;
    if (e.touches.length === 1 && this.state === "one finger")
      this.handleSingleFingerZoom(e);
    if (e.touches.length === 2 && this.state === "two fingers")
      this.handleTwoFingersZoom(e);
  };

  async handleSingleFingerZoom(e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const touch = e.touches[0];
    if (this.singleFingerStart && movedPastThreshold(this.singleFingerStart, touch))
      this.singleFingerDragged = true;
    const ts_old = this.lastTouches!;
    this.lastTouches = e.touches;
    const ts_new = e.touches;
    const dist = ts_new[0].clientY - ts_old[0].clientY;

    await this.handleZoom(dist);
  }
  async handleTwoFingersZoom(e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const ts_old = this.lastTouches!;
    this.lastTouches = e.touches;
    const ts_new = e.touches;
    const spread_old = Math.sqrt(
      (ts_old[0].clientX - ts_old[1].clientX) ** 2 +
        (ts_old[0].clientY - ts_old[1].clientY) ** 2
    );
    const spread_new = Math.sqrt(
      (ts_new[0].clientX - ts_new[1].clientX) ** 2 +
        (ts_new[0].clientY - ts_new[1].clientY) ** 2
    );
    await this.handleZoom(spread_new - spread_old);
  }
  async handleZoom(dist: number) {
    const wheelEvent = new WheelEvent("wheel", {
      clientX: this.clientX,
      clientY: this.clientY,
      deltaX: 0,
      deltaY: -dist,
    });

    this.el.querySelector(".nsewdrag.drag")!.dispatchEvent(wheelEvent);
  }

  private finishZoom() {
    this.onZoomEnd();
    this.state = "idle";
    this.lastTouches = undefined;
    this.elRect = undefined;
    this.singleFingerStart = undefined;
    this.singleFingerDragged = false;
  }

  onTouchEnd = (e: TouchEvent) => {
    if (this.continueHover(e)) return;

    if (!this.isEnabled) return;
    if (this.state !== "idle") {
      if (this.state === "one finger" && !this.singleFingerDragged
        && e.touches.length === 0 && e.changedTouches.length === 1)
        this.dispatchPlotlyTap(e.changedTouches[0]);
      this.finishZoom();
    }
  };

  onTouchCancel = (e: TouchEvent) => {
    if (this.continueHover(e)) return;
    if (this.state === "one finger" || this.state === "two fingers")
      this.finishZoom();
  };
}
