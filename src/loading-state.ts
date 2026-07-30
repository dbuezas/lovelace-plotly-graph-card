import type { InputConfig } from "./types";

export const DEFAULT_PLOT_HEIGHT = 285;

export function getInitialPlotHeight(layout: InputConfig["layout"]): number {
  const height = layout?.height;
  return typeof height === "number" && Number.isFinite(height) && height > 0
    ? height
    : DEFAULT_PLOT_HEIGHT;
}

export function setInitialLoadingHeight(
  card: HTMLElement,
  layout: InputConfig["layout"],
) {
  card.style.setProperty(
    "--plotly-loading-height",
    `${getInitialPlotHeight(layout)}px`,
  );
}

export function finishInitialLoading(
  card: HTMLElement,
  indicator: HTMLElement,
) {
  card.classList.remove("loading");
  card.setAttribute("aria-busy", "false");
  indicator.setAttribute("aria-hidden", "true");
}
