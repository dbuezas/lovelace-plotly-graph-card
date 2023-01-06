import { Layout, LayoutAxis } from "plotly.js";

type PlotlyEl = Plotly.PlotlyHTMLElement & {
  data: (Plotly.PlotData & { entity: string })[];
  layout: Plotly.Layout;
};
const zoomedRange = (axis: Partial<LayoutAxis>, zoom: number) => {
  if (!axis || !axis.range) return undefined;
  const center = (+axis.range[1] + +axis.range[0]) / 2;
  if (isNaN(center)) return undefined; // probably a categorical axis. Don't zoom
  const radius = (+axis.range[1] - +axis.range[0]) / zoom / 2;
  return [center - radius, center + radius];
};
const ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD = 250;
export class TouchController {
  isEnabled = true;
  lastTouches?: TouchList;
  lastSingleTouchTimestamp = 0;
  elRect?: DOMRect;
  el: PlotlyEl;
  onZoomStart: Function;
  onZoom: Function;
  onZoomEnd: Function;
  state: "one finger" | "two fingers" | "idle" = "idle";
  constructor(param: {
    el: PlotlyEl;
    onZoomStart: Function;
    onZoom: (layout: Partial<Layout>) => any;
    onZoomEnd: Function;
  }) {
    this.el = param.el;
    this.onZoom = param.onZoom;
    this.onZoomStart = param.onZoomStart;
    this.onZoomEnd = param.onZoomEnd;
  }
  disconnect() {
    this.el.removeEventListener("touchmove", this.onTouchMove);
    this.el.removeEventListener("touchstart", this.onTouchStart);
    this.el.removeEventListener("touchend", this.onTouchEnd);
  }
  connect() {
    this.el.addEventListener("touchmove", this.onTouchMove, {
      capture: true,
    });
    this.el.addEventListener("touchstart", this.onTouchStart, {
      capture: true,
    });
    this.el.addEventListener("touchend", this.onTouchEnd, {
      capture: true,
    });
  }

  onTouchStart = async (e: TouchEvent) => {
    if (!this.isEnabled) return;
    const stateWas = this.state;
    this.state = "idle";
    if (e.touches.length == 1) {
      const now = Date.now();
      if (
        now - this.lastSingleTouchTimestamp <
        ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD
      ) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.state = "one finger";
        this.lastTouches = e.touches;
        this.elRect = this.el.getBoundingClientRect();
      } else {
        this.lastSingleTouchTimestamp = now;
      }
    } else if (e.touches.length == 2) {
      this.state = "two fingers";
      this.lastTouches = e.touches;
    }
    if (stateWas === "idle" && stateWas !== this.state) {
      this.onZoomStart();
    }
  };

  onTouchMove = async (e: TouchEvent) => {
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
    const ts_old = this.lastTouches!;
    this.lastTouches = e.touches;
    const ts_new = e.touches;
    const height = this.elRect?.height || 500;
    const dist = (ts_new[0].clientY - ts_old[0].clientY) / height;
    let zoom = 1;
    if (dist > 0) zoom = 1 + dist * 4;
    if (dist < 0) zoom = 1 / (1 - dist * 4);
    await this.handleZoom(zoom);
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
    await this.handleZoom(spread_new / spread_old);
  }
  async handleZoom(zoom: number) {
    const oldLayout = this.el.layout;
    const layout = {};

    layout["xaxis.range"] = zoomedRange(oldLayout.xaxis, zoom);
    layout["yaxis.range"] = zoomedRange(oldLayout.yaxis, zoom);
    for (let i = 2; i < 31; i++) {
      layout[`xaxis${i}.range`] = zoomedRange(oldLayout[`xaxis${i}`], zoom);
      layout[`yaxis${i}.range`] = zoomedRange(oldLayout[`yaxis${i}`], zoom);
    }
    this.onZoom(layout);
  }

  onTouchEnd = () => {
    if (!this.isEnabled) return;

    if (this.state !== "idle") {
      this.onZoomEnd();
      this.state = "idle";
    }
  };
}
