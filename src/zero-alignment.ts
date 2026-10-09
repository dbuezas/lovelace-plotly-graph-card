type Axis = Partial<Plotly.LayoutAxis>;
type Trace = { yaxis?: string; visible?: unknown; y?: readonly unknown[] };
type Relayout = Partial<Plotly.Layout> & Record<string, unknown>;

function axesIn(layout: Partial<Plotly.Layout>): Record<string, Axis> {
  return Object.fromEntries(
    Object.entries(layout).filter(([key]) => /^[xy]axis\d*$/.test(key)),
  );
}

function axisName(id: string) {
  return id[0] + "axis" + id.slice(1);
}

function hasLimits(axis: Axis) {
  const options = axis.autorangeoptions;
  return (
    options &&
    [
      options.minallowed,
      options.maxallowed,
      options.clipmin,
      options.clipmax,
    ].some((value) => value !== undefined)
  );
}

// Capture explicit ranges before Plotly writes its calculated ranges into layout.
export function getZeroAlignmentProtectedAxes(
  layout: Partial<Plotly.Layout>,
  autorangeMainAxis = false,
) {
  const template =
    typeof layout.template === "object" && layout.template !== null
      ? (layout.template.layout ?? {})
      : {};
  const axes = axesIn(template);
  for (const [key, axis] of Object.entries(axesIn(layout))) {
    axes[key] = { ...axes[key], ...axis };
  }
  const protectedAxes = new Set<string>();
  for (const [key, axis] of Object.entries(axes)) {
    if (axis.range !== undefined && !(key === "yaxis" && autorangeMainAxis)) {
      protectedAxes.add(key);
    }
    for (const link of [axis.matches, axis.scaleanchor]) {
      if (typeof link === "string") {
        protectedAxes.add(axisName(link));
      }
    }
  }
  return protectedAxes;
}

export function getZeroAlignmentRelayout(
  layout: Partial<Plotly.Layout>,
  traces: readonly Trace[],
  protectedAxes: ReadonlySet<string>,
): Relayout | undefined {
  const axes = axesIn(layout);
  const usedAxes = new Set(
    traces
      .filter(
        (trace) =>
          trace.visible !== false &&
          trace.visible !== "legendonly" &&
          trace.y?.some(Number.isFinite),
      )
      .flatMap((trace) => (trace.yaxis ? [axisName(trace.yaxis)] : [])),
  );
  const groups = new Map<
    string,
    {
      key: string;
      start: number;
      end: number;
      span: number;
      reversed: boolean;
    }[]
  >();
  for (const [key, axis] of Object.entries(axes)) {
    if (
      !key.startsWith("y") ||
      !usedAxes.has(key) ||
      protectedAxes.has(key) ||
      axis.type !== "linear" ||
      axis.autorange !== true ||
      hasLimits(axis) ||
      axis.rangemode === "nonnegative" ||
      axis.matches ||
      axis.scaleanchor
    )
      continue;
    const range = axis.range;
    if (
      !range ||
      range.length !== 2 ||
      !range.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    )
      continue;
    const reversed = range[0] > range[1];
    const start = reversed ? Math.max(0, range[0]) : Math.min(0, range[0]);
    const end = reversed ? Math.min(0, range[1]) : Math.max(0, range[1]);
    const span = Math.abs(range[1] - range[0]);
    if (!(span > 0) || !Number.isFinite(span)) continue;

    let root = key;
    const seen = new Set<string>();
    while (true) {
      const overlaying = axes[root]?.overlaying;
      if (typeof overlaying !== "string") break;
      if (seen.has(root)) break;
      seen.add(root);
      root = axisName(overlaying);
    }
    const groupKey = `${root}:${JSON.stringify(axis.domain)}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ key, start, end, span, reversed });
    groups.set(groupKey, group);
  }

  const update: Relayout = {};
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const leading = Math.max(
      ...group.map(({ start, span }) => Math.abs(start) / span),
    );
    const trailing = Math.max(
      ...group.map(({ end, span }) => Math.abs(end) / span),
    );
    // This fraction minimizes the largest proportional range expansion in the group.
    if (!Number.isFinite(leading + trailing)) continue;
    const fraction = leading / (leading + trailing);
    for (const { key, start, end, reversed } of group) {
      const span = Math.max(
        fraction > 0 ? Math.abs(start) / fraction : 0,
        fraction < 1 ? Math.abs(end) / (1 - fraction) : 0,
      );
      const sign = reversed ? -1 : 1;
      const range = [-sign * span * fraction, sign * span * (1 - fraction)].map(
        (value) => (value === 0 ? 0 : value),
      );
      const previous = axes[key].range!;
      if (
        !range.every(Number.isFinite) ||
        range.every(
          (value, i) =>
            Math.abs(value - previous[i]) <=
            1e-10 * Math.max(1, Math.abs(previous[i])),
        )
      )
        continue;
      // Include extends native autorange without disabling it or changing user zoom ranges.
      update[`${key}.autorangeoptions.include`] = range;
    }
  }
  return Object.keys(update).length ? update : undefined;
}
