import { EntityConfig, InputConfig } from "../types";

const axisLayoutKey = /^[xy]axis(?:\d+)?$/;
const axisReference = /^([xy])(\d+)?(?: domain)?$/;
const subplotReference = /^(x\d*)(y\d*)$/;
const axisLayoutPath = /^([xy]axis(?:\d+)?)(?:[.\[]|$)/;
const configuredAxes = new WeakMap<InputConfig, Set<string>>();

export function getCartesianLayoutAxes(
  layout: Partial<Plotly.Layout> | undefined,
): Set<string> {
  return new Set(
    Object.keys(layout || {}).filter((key) => axisLayoutKey.test(key)),
  );
}

export function rememberConfiguredAxes(
  config: InputConfig,
  axes: Iterable<string>,
) {
  configuredAxes.set(config, new Set(axes));
}

export function getRememberedConfiguredAxes(
  config: InputConfig,
): ReadonlySet<string> {
  return configuredAxes.get(config) || new Set();
}

function collectAxisReferences(
  value: unknown,
  axes: Set<string>,
  seen: WeakSet<object>,
) {
  if (typeof value === "string") {
    const match = axisReference.exec(value);
    if (match) {
      const index = match[2] && match[2] !== "1" ? match[2] : "";
      axes.add(`${match[1]}axis${index}`);
    }
    const subplot = subplotReference.exec(value);
    if (subplot) {
      collectAxisReferences(subplot[1], axes, seen);
      collectAxisReferences(subplot[2], axes, seen);
    }
    const path = axisLayoutPath.exec(value);
    if (path) axes.add(path[1]);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;

  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const path = axisLayoutPath.exec(key);
    if (path) axes.add(path[1]);
    collectAxisReferences(child, axes, seen);
  }
}

export function pruneUnusedCartesianAxes(
  layout: Partial<Plotly.Layout>,
  entities: EntityConfig[],
  explicitlyConfiguredAxes: ReadonlySet<string>,
): Partial<Plotly.Layout> {
  const usedAxes = new Set(["xaxis", "yaxis", ...explicitlyConfiguredAxes]);
  const seen = new WeakSet<object>();

  for (const entity of entities) {
    if ("xaxis" in entity) collectAxisReferences(entity.xaxis, usedAxes, seen);
    if ("yaxis" in entity) collectAxisReferences(entity.yaxis, usedAxes, seen);
  }
  for (const [key, value] of Object.entries(layout)) {
    if (!axisLayoutKey.test(key)) collectAxisReferences(value, usedAxes, seen);
  }
  // Follow dependencies only from retained axes. Set iteration also visits axes
  // discovered here, so matches/anchor/scaleanchor chains remain intact.
  for (const axis of usedAxes) {
    collectAxisReferences(layout[axis], usedAxes, seen);
  }

  return Object.fromEntries(
    Object.entries(layout).filter(
      ([key]) => !axisLayoutKey.test(key) || usedAxes.has(key),
    ),
  );
}
