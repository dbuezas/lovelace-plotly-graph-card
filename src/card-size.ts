export type CardSize = {
  width?: number;
  height?: number;
};

type LayoutSize = Partial<Pick<Plotly.Layout, "width" | "height">>;

const dimensions = ["width", "height"] as const;

export function getResizeLayoutUpdate(
  previousSize: CardSize,
  nextSize: CardSize,
  configuredLayout: Partial<Plotly.Layout> = {},
): LayoutSize | null {
  const update: LayoutSize = {};
  for (const dimension of dimensions) {
    if (configuredLayout[dimension] !== undefined) continue;

    const previousValue = previousSize[dimension];
    const nextValue = nextSize[dimension];
    if (previousValue !== undefined && nextValue === undefined) return null;
    if (nextValue !== undefined && previousValue !== nextValue) {
      update[dimension] = nextValue;
    }
  }
  return update;
}
