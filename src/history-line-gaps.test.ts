import { prepareHistoryLineGaps } from "./history-line-gaps";

const xs = [0, 12 * 3600000, 12 * 3600000 + 60000, 24 * 3600000];
const base = {
  entity: "sensor.temperature",
  type: "scatter",
  mode: "lines",
  line: { shape: "hv", color: "red", width: 2 },
  x: xs,
  y: [10, null, 10, 10],
};

describe("history line gap boundaries", () => {
  it("holds the state up to the gap without removing the missing value", () => {
    const [drawn] = prepareHistoryLineGaps([base], false);
    expect(drawn.x).toEqual([xs[0], xs[1], xs[1], xs[2], xs[3]]);
    expect(drawn.y).toEqual([10, 10, null, 10, 10]);
    expect(base.x).toBe(xs);
    expect(base.y).toEqual([10, null, 10, 10]);
    expect(drawn.line).toBe(base.line);
  });

  it("handles zero and multiple consecutive missing values", () => {
    const trace = {
      ...base,
      x: [0, 1, 2, 3, 4, 5],
      y: [0, null, null, 2, undefined, 3],
    };
    const [drawn] = prepareHistoryLineGaps([trace], false);
    expect(drawn.x).toEqual([0, 1, 1, 2, 3, 4, 4, 5]);
    expect(drawn.y).toEqual([0, 0, null, null, 2, 2, undefined, 3]);
  });

  it.each([
    { x: [new Date(0), new Date(1000)] },
    { x: ["1970-01-01T00:00:00Z", "1970-01-01T00:00:01Z"] },
  ])("preserves date coordinates: %j", ({ x }) => {
    const trace = { ...base, x, y: ["off", null] };
    const [drawn] = prepareHistoryLineGaps([trace], false);
    expect(drawn.x).toEqual([x[0], x[1], x[1]]);
    expect(drawn.y).toEqual(["off", "off", null]);
  });

  it("keeps per-point hover data aligned without altering trace metadata", () => {
    const customdata = [
      [1, "one"],
      [2, "two"],
      [3, "three"],
      [4, "four"],
    ];
    const trace = {
      ...base,
      customdata,
      text: ["a", "b", "c", "d"],
      hovertext: ["a", "b", "c", "d"],
      hovertemplate: ["a", "b", "c", "d"],
      hoverinfo: ["text", "none", "x", "y"],
      hoverlabel: {
        bgcolor: ["red", "blue", "green", "black"],
        font: { size: [10, 11, 12, 13] },
      },
      meta: [1, 2, 3, 4],
    };
    const [drawn] = prepareHistoryLineGaps([trace], false);
    expect(drawn.customdata).toEqual([
      customdata[0],
      customdata[0],
      ...customdata.slice(1),
    ]);
    expect(drawn.text).toEqual(["a", "a", "b", "c", "d"]);
    expect(drawn.hovertext).toEqual(drawn.text);
    expect(drawn.hovertemplate).toEqual(drawn.text);
    expect(drawn.hoverinfo).toEqual(["text", "text", "none", "x", "y"]);
    expect(drawn.hoverlabel).toEqual({
      bgcolor: ["red", "red", "blue", "green", "black"],
      font: { size: [10, 10, 11, 12, 13] },
    });
    expect(drawn.meta).toBe(trace.meta);
    expect(trace.customdata).toBe(customdata);
    expect(trace.hoverlabel.font.size).toEqual([10, 11, 12, 13]);
  });

  it("does not add a point at the start of a trace or at non-increasing timestamps", () => {
    for (const trace of [
      { ...base, y: [null, null, 10, 10] },
      { ...base, x: [0, 0, 2, 3] },
      { ...base, x: [2, 1, 2, 3] },
      { ...base, x: [0, "invalid", 2, 3] },
      { ...base, y: [NaN, null, 10, 10] },
    ])
      expect(prepareHistoryLineGaps([trace], false)[0]).toBe(trace);
  });

  it("does not allocate new trace data when there are no gaps", () => {
    const trace = { ...base, y: [10, 20, 10, 10] };
    expect(prepareHistoryLineGaps([trace], false)[0]).toBe(trace);
  });

  it("does not accumulate endpoints across refreshes", () => {
    const first = prepareHistoryLineGaps([base], false)[0];
    const second = prepareHistoryLineGaps([base], false)[0];
    expect(second).toEqual(first);
    expect(prepareHistoryLineGaps([first], false)[0]).toBe(first);
  });

  it("preserves scalar hover templates", () => {
    const [drawn] = prepareHistoryLineGaps(
      [{ ...base, hovertemplate: "%{y}<extra></extra>" }],
      false,
    );
    expect(drawn.hovertemplate).toBe("%{y}<extra></extra>");
  });

  it.each([
    { entity: "" },
    { statistic: "mean" },
    { period: "hour" },
    { attribute: "temperature" },
    { type: "bar" },
    { type: "scattergl" },
    { line: { shape: "linear" } },
    { line: { shape: "vh" } },
    { mode: "lines+markers" },
    { connectgaps: true },
    { ids: ["a", "b", "c", "d"] },
    { selectedpoints: [0, 1] },
    { error_y: { array: [1, 2, 3, 4] } },
    { x: [0, 1] },
  ])(
    "leaves unsupported or explicitly different plots alone: %j",
    (override) => {
      const trace = { ...base, ...override };
      expect(prepareHistoryLineGaps([trace], false)[0]).toBe(trace);
    },
  );

  it("leaves raw Plotly data untouched", () => {
    const entities = [base];
    expect(prepareHistoryLineGaps(entities, true)).toBe(entities);
  });
});
