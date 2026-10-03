type Trace = Record<string, unknown>;

function isObject(value: unknown): value is Trace {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): number {
  if (value instanceof Date) return +value;
  if (typeof value === "number") return value;
  return typeof value === "string" ? Date.parse(value) : NaN;
}

const pointFields = [
  "text",
  "hovertext",
  "hovertemplate",
  "hoverinfo",
  "texttemplate",
  "customdata",
];

/** Add drawing-only endpoints without changing the parsed history or filters. */
export function prepareHistoryLineGaps<T extends object>(
  entities: T[],
  raw: boolean,
): T[] {
  if (raw) return entities;
  return entities.map((entity) => {
    const trace = entity as Trace;
    if (
      typeof trace.entity !== "string" ||
      !trace.entity ||
      trace.statistic ||
      trace.period ||
      trace.attribute ||
      (trace.type !== undefined && trace.type !== "scatter") ||
      trace.mode !== "lines" ||
      !isObject(trace.line) ||
      trace.line.shape !== "hv" ||
      trace.connectgaps === true ||
      trace.ids !== undefined ||
      trace.selectedpoints !== undefined ||
      [trace.error_x, trace.error_y].some(
        (error) => isObject(error) && error.visible !== false,
      )
    )
      return entity;

    const { x, y } = trace;
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length)
      return entity;
    const boundaries = new Set<number>();
    for (let i = 1; i < y.length; i++) {
      if (
        (y[i] === null || y[i] === undefined) &&
        y[i - 1] !== null &&
        y[i - 1] !== undefined &&
        !(typeof y[i - 1] === "number" && !Number.isFinite(y[i - 1])) &&
        Number.isFinite(timestamp(x[i])) &&
        timestamp(x[i]) > timestamp(x[i - 1])
      )
        boundaries.add(i);
    }
    if (!boundaries.size) return entity;

    const sources: number[] = [];
    const xs: unknown[] = [];
    for (let i = 0; i < x.length; i++) {
      if (boundaries.has(i)) {
        sources.push(i - 1);
        xs.push(x[i]);
      }
      sources.push(i);
      xs.push(x[i]);
    }
    const expand = (values: unknown[]) => sources.map((index) => values[index]);
    const drawn: Trace = { ...trace, x: xs, y: expand(y) };
    for (const field of pointFields) {
      const values = trace[field];
      if (Array.isArray(values) && values.length === y.length)
        drawn[field] = expand(values);
    }
    const expandHoverStyle = (style: Trace): Trace =>
      Object.fromEntries(
        Object.entries(style).map(([key, value]) => [
          key,
          Array.isArray(value) && value.length === y.length
            ? expand(value)
            : isObject(value)
              ? expandHoverStyle(value)
              : value,
        ]),
      );
    if (isObject(trace.hoverlabel))
      drawn.hoverlabel = expandHoverStyle(trace.hoverlabel);
    return drawn as T;
  });
}
