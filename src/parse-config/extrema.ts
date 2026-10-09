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
    const value =
      typeof y === "number" || (typeof y === "string" && y.trim())
        ? Number(y)
        : NaN;
    const time = x instanceof Date ? x.getTime() : undefined;
    if (
      x == null ||
      !Number.isFinite(value) ||
      (typeof x === "number" && !Number.isFinite(x)) ||
      (time !== undefined &&
        (!Number.isFinite(time) || time < range[0] || time > range[1]))
    )
      continue;
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
  const color =
    typeof trace.marker?.color === "string"
      ? trace.marker.color
      : trace.line?.color;
  return {
    texttemplate: `%{y:.2~f} ${trace.unit_of_measurement ?? ""}`,
    ...trace,
    uid: trace.uid ? `${trace.uid}-extrema` : undefined,
    type: "scatter",
    mode: "text+markers",
    showlegend: false,
    hoverinfo: "skip",
    hovertemplate: null,
    fill: "none",
    stackgroup: undefined,
    cliponaxis: false,
    marker: { color, size: 5 },
    textfont: { color },
    textposition: "top center",
    x: indices.map((index) => trace.x![index]),
    y: indices.map((index) => Number(trace.y![index])),
  };
}
