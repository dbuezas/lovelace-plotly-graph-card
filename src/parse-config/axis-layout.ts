import { EntityConfig, InputConfig } from "../types";

const axisLayoutKey = /^[xy]axis(?:\d+)?$/;
const axisReference = /^([xy])(\d+)?$/;
const configuredAxes = new WeakMap<InputConfig, Set<string>>();

export function getCartesianLayoutAxes(
  layout: Partial<Plotly.Layout> | undefined
): Set<string> {
  return new Set(
    Object.keys(layout || {}).filter((key) => axisLayoutKey.test(key))
  );
}

export function rememberConfiguredAxes(
  config: InputConfig,
  axes: Iterable<string>
) {
  configuredAxes.set(config, new Set(axes));
}

export function getRememberedConfiguredAxes(
  config: InputConfig
): ReadonlySet<string> {
  return configuredAxes.get(config) || new Set();
}

function collectAxisReferences(
  value: unknown,
  axes: Set<string>,
  seen: WeakSet<object>
) {
  if (typeof value === "string") {
    const match = axisReference.exec(value);
    if (!match) return;
    const index = match[2] && match[2] !== "1" ? match[2] : "";
    axes.add(`${match[1]}axis${index}`);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;

  seen.add(value);
  for (const child of Object.values(value)) {
    collectAxisReferences(child, axes, seen);
  }
}

export function pruneUnusedCartesianAxes(
  layout: Partial<Plotly.Layout>,
  entities: EntityConfig[],
  explicitlyConfiguredAxes: ReadonlySet<string>
): Partial<Plotly.Layout> {
  const usedAxes = new Set(["xaxis", "yaxis", ...explicitlyConfiguredAxes]);
  const seen = new WeakSet<object>();

  for (const entity of entities) {
    collectAxisReferences(entity.xaxis, usedAxes, seen);
    collectAxisReferences(entity.yaxis, usedAxes, seen);
  }
  for (const value of Object.values(layout)) {
    collectAxisReferences(value, usedAxes, seen);
  }

  return Object.fromEntries(
    Object.entries(layout).filter(
      ([key]) => !axisLayoutKey.test(key) || usedAxes.has(key)
    )
  );
}
