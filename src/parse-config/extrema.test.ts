import { getExtremaTrace } from "./extrema";

const dates = (...hours: number[]) =>
  hours.map((hour) => new Date(hour * 3600000));
const range: [number, number] = [0, 4 * 3600000];

describe("extrema labels", () => {
  it("labels the filtered minimum and maximum without changing the source", () => {
    const trace = {
      x: dates(0, 1, 2, 3),
      y: [4, "2", null, 8],
      customdata: ["a", "b", "c", "d"],
      unit_of_measurement: "W",
      line: { color: "blue" },
      xaxis: "x2",
      yaxis: "y2",
      fill: "tonexty",
      stackgroup: "power",
      uid: "power",
    } satisfies Parameters<typeof getExtremaTrace>[0];
    const before = structuredClone(trace);
    const labels = getExtremaTrace(trace, range)!;
    expect(labels).toMatchObject({
      x: dates(1, 3),
      y: [2, 8],
      customdata: ["b", "d"],
      xaxis: "x2",
      yaxis: "y2",
      type: "scatter",
      mode: "text+markers",
      texttemplate: "%{y:.2~f} W",
      marker: { color: "blue" },
      fill: "none",
      stackgroup: undefined,
      showlegend: false,
      uid: "power-extrema",
    });
    expect(trace).toEqual(before);
  });

  it("uses only points in the visible time window", () => {
    const trace = { x: dates(-1, 0, 1, 2, 3), y: [-100, 4, 2, 6, 100] };
    expect(getExtremaTrace(trace, [0, 2 * 3600000])).toMatchObject({
      x: dates(1, 2),
      y: [2, 6],
    });
    expect(getExtremaTrace(trace, [3 * 3600000, 4 * 3600000])).toMatchObject({
      x: dates(3),
      y: [100],
    });
  });

  it("ignores unavailable, empty and non-finite values rather than treating them as zero", () => {
    const y = [null, "unknown", "unavailable", "", " ", NaN, Infinity, "5"];
    expect(getExtremaTrace({ x: y.map((_, i) => i), y }, range)).toMatchObject({
      x: [7],
      y: [5],
    });
    expect(getExtremaTrace({ x: [0], y: [null] }, range)).toBeUndefined();
    expect(getExtremaTrace({ x: [], y: [] }, range)).toBeUndefined();
  });

  it("uses the first occurrence of a tied extremum and labels a constant series once", () => {
    expect(
      getExtremaTrace({ x: [0, 1, 2, 3], y: [2, 8, 2, 8] }, range),
    ).toMatchObject({ x: [0, 1], y: [2, 8] });
    expect(getExtremaTrace({ x: [0, 1], y: [0, 0] }, range)).toMatchObject({
      x: [0],
      y: [0],
    });
  });

  it("preserves point-specific formatting and a bar's explicit color", () => {
    const labels = getExtremaTrace(
      {
        type: "bar",
        x: [0, 1, 2],
        y: [3, 8, 1],
        marker: { color: "red" },
        line: { color: "blue" },
        texttemplate: ["first", "maximum", "minimum"],
        textfont: { color: ["red", "green", "blue"], size: [10, 11, 12] },
        visible: "legendonly",
        legendgroup: "energy",
      },
      range,
    )!;
    expect(labels).toMatchObject({
      x: [2, 1],
      y: [1, 8],
      marker: { color: "red" },
      texttemplate: ["minimum", "maximum"],
      textfont: { color: ["blue", "green"], size: [12, 11] },
      visible: "legendonly",
      legendgroup: "energy",
    });
  });

  it("does not attach Cartesian labels to non-Cartesian or horizontal traces", () => {
    expect(
      getExtremaTrace({ type: "pie", x: [0, 1], y: [2, 3] }, range),
    ).toBeUndefined();
    expect(
      getExtremaTrace(
        { type: "bar", orientation: "h", x: [0, 1], y: [2, 3] },
        range,
      ),
    ).toBeUndefined();
  });
});
