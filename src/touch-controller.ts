import { TouchGestures } from "./types";

type PlotlyEl = Plotly.PlotlyHTMLElement & {
  layout: Plotly.Layout;
  // Plotly keeps its drag state on the graph div "so that others can look at
  // and modify them" (plotly.js dragelement)
  _dragging?: boolean;
  _dragged?: boolean;
  _context?: { _scrollZoom?: { cartesian?: boolean } };
};

// Public, but missing in the plotly.js types
type Fx = {
  hover: (el: HTMLElement, evt: object, subplot?: string) => void;
  unhover: (el: HTMLElement) => void;
};

const DOUBLE_TAP_MS = 250;
const TAP_TOLERANCE_PX = 8;
const SCAN_HOLD_MS = 300;

type Handler = (e: TouchEvent) => void;
type Gesture = (
  el: PlotlyEl,
  controller: TouchController,
) => {
  start: Handler;
  move: Handler;
  end: Handler;
  cleanup?: () => void; // on disconnect, e.g. to cancel timers
};

const stop = (e: TouchEvent) => {
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
};
const moved = (t: Touch, from: { x: number; y: number }) =>
  Math.hypot(t.clientX - from.x, t.clientY - from.y) >= TAP_TOLERANCE_PX;
const draggerOf = (el: PlotlyEl, touch?: Touch) => {
  const dragger = (touch?.target as Element | null)?.closest?.(".nsewdrag");
  return dragger && el.contains(dragger) ? dragger : undefined;
};

// Plotly starts a drag on every touch on the plot. When a gesture takes the
// touch, end Plotly's drag: finish it if it already moved (keeps a started
// pan), else cancel it, so Plotly emits no click or double click on touchend.
const takeOver = (el: PlotlyEl, controller: TouchController) => {
  if (el._dragged) document.dispatchEvent(new MouseEvent("mouseup"));
  el._dragging = false;
  controller.Fx?.unhover(el);
};

// Zoom and pan go through Plotly's scroll zoom, so Plotly handles axis types,
// fixedrange and redraws. Each wheel event scales the ranges by
// exp(deltaY / 200), with deltaY capped at ±20. Plotly ignores wheel events
// with `scrollZoom: false`, which is meant for the mouse, so it is turned on
// just for these.
const WHEEL_STEP = 20;
const wheel = (
  dragger: Element,
  clientX: number,
  clientY: number,
  deltaY: number,
) => {
  const scrollZoom =
    dragger.closest<PlotlyEl>(".js-plotly-plot")?._context?._scrollZoom;
  const enabled = scrollZoom?.cartesian;
  if (scrollZoom) scrollZoom.cartesian = true;
  try {
    dragger.dispatchEvent(
      new WheelEvent("wheel", { clientX, clientY, deltaY }),
    );
  } finally {
    if (scrollZoom) scrollZoom.cartesian = enabled;
  }
};
const zoomAt = (dragger: Element, x: number, y: number, factor: number) => {
  const deltaY = 200 * Math.log(factor);
  const steps = Math.ceil(Math.abs(deltaY) / WHEEL_STEP);
  for (let i = 0; i < steps; i++) wheel(dragger, x, y, deltaY / steps);
};
// Plotly has no pan API, but zooming out at one point and back in at another
// pans by (distance between the points) × (zoom - 1).
const panBy = (dragger: Element, dx: number, dy: number) => {
  if (!dx && !dy) return;
  const k = 1 / (Math.exp(WHEEL_STEP / 200) - 1);
  wheel(dragger, 0, 0, WHEEL_STEP);
  wheel(dragger, -dx * k, -dy * k, -WHEEL_STEP);
};

// Two fingers zoom at their center and pan with it, like a map. After one
// finger is lifted, the other one keeps panning.
const pinch: Gesture = (el, controller) => {
  let dragger: Element | undefined;
  let last = { x: 0, y: 0, spread: 0 };
  const measure = (touches: TouchList) => {
    const [a, b = a] = Array.from(touches);
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
      spread: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    };
  };
  return {
    start: (e) => {
      if (!dragger) {
        if (!controller.enabled.pinch_to_zoom || e.touches.length < 2) return;
        dragger = draggerOf(el, e.touches[0]) ?? draggerOf(el, e.touches[1]);
        if (!dragger) return;
        takeOver(el, controller);
        controller.zoomStart();
      }
      stop(e);
      last = measure(e.touches);
    },
    move: (e) => {
      if (!dragger) return;
      stop(e);
      const now = measure(e.touches);
      panBy(dragger, now.x - last.x, now.y - last.y);
      if (now.spread && last.spread)
        zoomAt(dragger, now.x, now.y, last.spread / now.spread);
      last = now;
    },
    end: (e) => {
      if (!dragger) return;
      if (e.touches.length) return void (last = measure(e.touches));
      dragger = undefined;
      controller.zoomEnd();
    },
  };
};

// Double tap, then drag: up/down zooms, left/right pans. A plain double tap
// stays Plotly's (reset), so the gesture only starts once the finger moves.
const doubleTapDrag: Gesture = (el, controller) => {
  let lastTapTime = -Infinity;
  let firstTap: { x: number; y: number } | undefined; // until it moves
  let tap:
    | { dragger: Element; x: number; y: number; lastX: number; lastY: number }
    | undefined;
  let zooming = false;
  const end = () => {
    tap = undefined;
    if (zooming) controller.zoomEnd();
    zooming = false;
  };
  return {
    start: (e) => {
      end(); // a second finger hands over to pinch
      if (e.touches.length !== 1) return void (lastTapTime = -Infinity);
      const t = e.touches[0];
      const dragger = draggerOf(el, t);
      if (e.timeStamp - lastTapTime >= DOUBLE_TAP_MS)
        return void (firstTap = { x: t.clientX, y: t.clientY });
      if (controller.enabled.double_tap_drag_to_zoom && dragger)
        tap = {
          dragger,
          x: t.clientX,
          y: t.clientY,
          lastX: t.clientX,
          lastY: t.clientY,
        };
    },
    move: (e) => {
      const t = e.touches[0];
      if (firstTap && moved(t, firstTap)) firstTap = undefined; // a swipe
      if (!tap) return;
      if (!zooming) {
        if (!moved(t, tap)) return stop(e); // still a double tap for Plotly
        if (!el._dragging) return void (tap = undefined); // scan has it
        zooming = true;
        takeOver(el, controller);
        controller.zoomStart();
      }
      stop(e);
      // Left/right pans with the finger, up/down zooms around it
      panBy(tap.dragger, t.clientX - tap.lastX, 0);
      zoomAt(
        tap.dragger,
        t.clientX,
        tap.y,
        Math.exp((tap.lastY - t.clientY) / 200),
      );
      tap.lastX = t.clientX;
      tap.lastY = t.clientY;
    },
    end: (e) => {
      // Only a tap that didn't move can start a double tap
      lastTapTime = firstTap && !e.touches.length ? e.timeStamp : -Infinity;
      firstTap = undefined;
      end();
    },
  };
};

// Press and hold, then slide: the tooltip follows the finger and stays after
// lifting it. The next touch clears it.
const scan: Gesture = (el, controller) => {
  let hold:
    | { dragger: Element; x: number; y: number; scanning: boolean }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hover = (dragger: Element, clientX: number, clientY: number) => {
    const { hovermode } = el.layout;
    controller.Fx?.hover(
      el,
      {
        clientX,
        clientY,
        target: dragger,
        // "closest" needs the finger right on a point; follow x instead
        hovermode: !hovermode || hovermode === "closest" ? "x" : hovermode,
      },
      dragger.getAttribute("data-subplot") ?? undefined,
    );
  };
  const end = () => {
    clearTimeout(timer);
    hold = undefined;
  };
  return {
    start: (e) => {
      end();
      const t = e.touches[0];
      const dragger = e.touches.length === 1 && draggerOf(el, t);
      if (
        !controller.enabled.hold_to_scan ||
        !dragger ||
        el.layout.hovermode === false
      )
        return;
      const h = { dragger, x: t.clientX, y: t.clientY, scanning: false };
      hold = h;
      timer = setTimeout(() => {
        takeOver(el, controller);
        h.scanning = true;
        hover(dragger, h.x, h.y);
      }, SCAN_HOLD_MS);
    },
    move: (e) => {
      if (!hold) return;
      const t = e.touches[0];
      if (e.touches.length !== 1 || (!hold.scanning && moved(t, hold)))
        return end(); // Plotly pans
      stop(e); // while holding, small moves stay hidden from Plotly
      if (hold.scanning) hover(hold.dragger, t.clientX, t.clientY);
    },
    end,
    cleanup: end,
  };
};

// Holding shows the tooltip, so a tap doesn't: Plotly's tap tooltip would get
// in the way of double taps and other gestures. Plotly still emits the click.
const tapWithoutTooltip: Gesture = (el, controller) => ({
  start: () => {},
  move: () => {},
  end: (e) => {
    // _dragging is still set when Plotly owns the touch (no gesture took it)
    if (controller.enabled.hold_to_scan && !e.touches.length && el._dragging)
      setTimeout(() => controller.Fx?.unhover(el)); // after Plotly's touchend
  },
});

type TouchEventName = "touchstart" | "touchmove" | "touchend" | "touchcancel";

export class TouchController {
  enabled: TouchGestures = {
    pinch_to_zoom: true,
    double_tap_drag_to_zoom: true,
    hold_to_scan: true,
  };
  el: PlotlyEl;
  onZoomStart: () => any;
  onZoomEnd: () => any;
  zooms = 0;
  Fx?: Fx; // set by the card once Plotly is loaded
  listeners: [TouchEventName, Handler][] = [];
  cleanups: (() => void)[] = [];
  constructor(param: {
    el: PlotlyEl;
    onZoomStart: () => any;
    onZoomEnd: () => any;
  }) {
    this.el = param.el;
    this.onZoomStart = param.onZoomStart;
    this.onZoomEnd = param.onZoomEnd;
  }
  connect() {
    this.disconnect();
    for (const gesture of [pinch, doubleTapDrag, scan, tapWithoutTooltip]) {
      const { start, move, end, cleanup } = gesture(this.el, this);
      if (cleanup) this.cleanups.push(cleanup);
      this.listeners.push(
        ["touchstart", start],
        ["touchmove", move],
        ["touchend", end],
        ["touchcancel", end],
      );
    }
    for (const [type, fn] of this.listeners)
      this.el.addEventListener(type, fn, { capture: true, passive: false });
  }
  disconnect() {
    for (const [type, fn] of this.listeners)
      this.el.removeEventListener(type, fn, { capture: true });
    this.listeners = [];
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    if (this.zooms) this.onZoomEnd();
    this.zooms = 0;
  }
  zoomStart() {
    if (this.zooms++ === 0) this.onZoomStart();
  }
  zoomEnd() {
    if (this.zooms && --this.zooms === 0) this.onZoomEnd();
  }
}
