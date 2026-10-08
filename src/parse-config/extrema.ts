type ExtremaSource = Partial<Omit<Plotly.ScatterData, "type">> & {
  type?: Plotly.Data["type"];
  unit_of_measurement?: string;
};

/** Drawing-only labels; extrema are taken from the filtered, visible series. */
export function getExtremaTrace(
  trace: ExtremaSource,
  range: readonly [number, number],
) {
  if (
    ![undefined, "scatter", "scattergl", "bar"].includes(trace.type) ||
    trace.orientation === "h" ||
    !Array.isArray(trace.x) ||
    !Array.isArray(trace.y)
  )
    return undefined;

  let minimum = Infinity;
  let maximum = -Infinity;
  let minIndex = -1;
  let maxIndex = -1;
  for (let i = 0; i < trace.y.length; i++) {
    const x = trace.x[i];
    const y = trace.y[i];
    if (
      x == null ||
      (typeof y !== "number" && typeof y !== "string") ||
      (typeof y === "string" && !y.trim())
    )
      continue;
    if (
      x instanceof Date &&
      (!Number.isFinite(x.getTime()) ||
        x.getTime() < range[0] ||
        x.getTime() > range[1])
    )
      continue;
    const value = Number(y);
    if (!Number.isFinite(value)) continue;
    if (value < minimum) {
      minimum = value;
      minIndex = i;
    }
    if (value > maximum) {
      maximum = value;
      maxIndex = i;
    }
  }
  if (minIndex === -1) return undefined;

  const indices = minIndex === maxIndex ? [minIndex] : [minIndex, maxIndex];
  const select = (value: unknown) =>
    Array.isArray(value) ? indices.map((index) => value[index]) : value;
  const color =
    typeof trace.marker?.color === "string"
      ? trace.marker.color
      : trace.line?.color;
  return {
    ...trace,
    uid: trace.uid ? `${trace.uid}-extrema` : undefined,
    type: "scatter",
    mode: "text+markers",
    show_value: false,
    show_extrema: false,
    showlegend: false,
    hoverinfo: "skip",
    hovertemplate: undefined,
    fill: "none",
    stackgroup: undefined,
    error_x: undefined,
    error_y: undefined,
    selectedpoints: undefined,
    cliponaxis: false,
    marker: { color, size: 5 },
    textfont: {
      color,
      ...Object.fromEntries(
        Object.entries(trace.textfont ?? {}).map(([key, value]) => [
          key,
          select(value),
        ]),
      ),
    },
    textposition: "top center",
    texttemplate:
      select(trace.texttemplate) ??
      `%{y:.2~f} ${trace.unit_of_measurement ?? ""}`,
    x: indices.map((index) => trace.x![index]),
    y: indices.map((index) => Number(trace.y![index])),
    text: select(trace.text),
    customdata: select(trace.customdata),
    ids: select(trace.ids),
  };
}
