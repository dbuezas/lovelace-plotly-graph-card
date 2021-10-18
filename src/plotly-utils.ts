import Plotly from "./plotly";
export function autorange(
  contentEl: HTMLElement,
  range: number[],
  data: Partial<Plotly.ScatterData>[],
  layout: Partial<Plotly.Layout>,
  config: Partial<Plotly.Config>
) {
  const boundedData = data.map((d) => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < d.x!.length; i++) {
      const dx: number = (d as any).x[i];
      const dy: number = (d as any).y[i];
      if (range[0] <= dx && dx <= range[1]) {
        x.push(dx);
        y.push(dy);
      }
    }
    return {
      ...d,
      x,
      y,
    };
  });
  Plotly.relayout(contentEl, {
    "xaxis.autorange": true,
    "yaxis.autorange": true,
  });

  Plotly.react(contentEl, boundedData, layout, {
    displaylogo: false,
    ...config,
  });
  Plotly.relayout(contentEl, {
    "xaxis.autorange": false,
    "xaxis.range": range as [number, number],
    "yaxis.autorange": false,
  });
}

export const extractRanges = (layout: Partial<Plotly.Layout>) => {
  const justRanges: Partial<Plotly.Layout> = {};
  Object.keys(layout).forEach((key) => {
    if (layout[key]?.range) {
      justRanges[key] ??= {};
      justRanges[key].range = layout[key].range;
    }
    if (layout[key]?.autorange) {
      justRanges[key] ??= {};
      justRanges[key].autorange = layout[key].autorange;
    }
  });
  return justRanges;
};
