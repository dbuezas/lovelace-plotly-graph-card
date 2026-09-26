export type CardSize = {
  width?: number;
  height?: number;
};

type LayoutSize = Partial<Pick<Plotly.Layout, "width" | "height">>;

const dimensions = ["width", "height"] as const;

// Expressions and custom filters can read dimensions indirectly through vars/get.
// Do not try to infer their dependencies from their source text.
export function hasDynamicSizeConfig(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (typeof value === "string") return /^\$(fn|ex)/.test(value);
  if (Array.isArray(value)) return value.some(hasDynamicSizeConfig);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(
      ([key, child]) =>
        (["fn", "map_x", "map_y", "map_y_numbers", "filter"].includes(key) &&
          typeof child === "string") ||
        hasDynamicSizeConfig(child),
    );
  }
  return false;
}

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
