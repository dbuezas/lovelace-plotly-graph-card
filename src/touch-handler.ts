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
export class TouchHandler {
  lastTouches?: TouchList;
  lastSingleTouchTimestamp?: number;
  el: PlotlyEl;
  onZoom: Function;
  onZoomEnd: Function;
  constructor(param: {
    el: PlotlyEl;
    onZoom: (layout: Partial<Layout>) => any;
    onZoomEnd: Function;
  }) {
    this.el = param.el;
    this.onZoom = param.onZoom;
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
    if (e.touches.length == 2) {
      this.lastTouches = e.touches;
    }
  };

  onTouchMove = async (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (!this.lastTouches) {
      this.lastTouches = e.touches;
      return;
    }
    const ts_old = this.lastTouches;
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
    const zoom = spread_new / spread_old;

    const oldLayout = this.el.layout;
    const layout = {};

    layout["xaxis.range"] = zoomedRange(oldLayout.xaxis, zoom);
    layout["yaxis.range"] = zoomedRange(oldLayout.yaxis, zoom);
    for (let i = 2; i < 31; i++) {
      layout[`xaxis${i}.range`] = zoomedRange(oldLayout[`xaxis${i}`], zoom);
      layout[`yaxis${i}.range`] = zoomedRange(oldLayout[`yaxis${i}`], zoom);
    }
    this.onZoom(layout);
  };
  onTouchEnd = () => {
    if (this.lastTouches) {
      this.lastTouches = undefined;
      this.onZoomEnd();
    }
  };
}
