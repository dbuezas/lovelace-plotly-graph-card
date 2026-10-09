import {
  getZeroAlignmentProtectedAxes,
  getZeroAlignmentRelayout,
} from "./zero-alignment";

const traces = [
  { yaxis: "y", y: ["-10", "100"] },
  { yaxis: "y2", y: ["0", "40"] },
];
function layout(ranges: number[][]): Partial<Plotly.Layout> {
  const result: Partial<Plotly.Layout> = {};
  ranges.forEach((range, i) => {
    const key = i ? (`yaxis${i + 1}` as const) : "yaxis";
    result[key] = {
      type: "linear",
      autorange: true,
      range: [range[0], range[1]],
      domain: [0, 1],
      ...(i ? { overlaying: "y" } : {}),
    };
  });
  return result;
}

function expanded(
  layout: Partial<Plotly.Layout>,
  update: ReturnType<typeof getZeroAlignmentRelayout>,
  key: string,
): number[] {
  return (
    (update?.[`${key}.autorangeoptions.include`] as number[]) ??
    layout[key].range
  );
}

describe("zero alignment from Plotly ranges", () => {
  test("expands mixed-sign ranges without clipping, with the smallest worst relative expansion", () => {
    const input = layout([
      [-10, 100],
      [0, 40],
    ]);
    input.yaxis!.fixedrange = true;
    input.yaxis2!.fixedrange = true;
    const update = getZeroAlignmentRelayout(input, traces, new Set());
    expect(expanded(input, update, "yaxis")[0]).toBeCloseTo(-10);
    expect(expanded(input, update, "yaxis")[1]).toBeCloseTo(110);
    expect(expanded(input, update, "yaxis2")[0]).toBeCloseTo(-40 / 11);
    expect(expanded(input, update, "yaxis2")[1]).toBeCloseTo(40);
    expect(Object.keys(update!)).toEqual([
      "yaxis.autorangeoptions.include",
      "yaxis2.autorangeoptions.include",
    ]);
  });

  test.each([
    [
      [
        [2, 100],
        [5, 40],
      ],
      [
        [0, 100],
        [0, 40],
      ],
    ],
    [
      [
        [-100, -2],
        [-40, -5],
      ],
      [
        [-100, 0],
        [-40, 0],
      ],
    ],
  ])("includes zero for one-sided groups: %j", (ranges, expected) => {
    const input = layout(ranges);
    const update = getZeroAlignmentRelayout(input, traces, new Set());
    expect(expanded(input, update, "yaxis")).toEqual(expected[0]);
    expect(expanded(input, update, "yaxis2")).toEqual(expected[1]);
  });

  test("uses original spans across an overlay chain, including ranges away from zero", () => {
    const input = layout([
      [-10, 100],
      [30, 40],
      [-20, 20],
    ]);
    input.yaxis3 = { ...input.yaxis3, overlaying: "y2" };
    const update = getZeroAlignmentRelayout(
      input,
      [...traces, { yaxis: "y3", y: [-20, 20] }],
      new Set(),
    );
    for (const [key, expected] of Object.entries({
      yaxis: [-12.5, 100],
      yaxis2: [-5, 40],
      yaxis3: [-20, 160],
    })) {
      const range = expanded(input, update, key);
      expect(range[0]).toBeCloseTo(expected[0]);
      expect(range[1]).toBeCloseTo(expected[1]);
    }
  });

  test("preserves reversed axes while placing zero at the same screen fraction", () => {
    const input = layout([
      [100, -10],
      [0, 40],
    ]);
    const update = getZeroAlignmentRelayout(input, traces, new Set());
    const first = expanded(input, update, "yaxis");
    const second = expanded(input, update, "yaxis2");
    expect(first[0]).toBeGreaterThan(first[1]);
    expect(first[0]).toBeGreaterThanOrEqual(100);
    expect(first[1]).toBeLessThanOrEqual(-10);
    expect(-first[0] / (first[1] - first[0])).toBeCloseTo(
      -second[0] / (second[1] - second[0]),
    );
  });

  test("does not relayout aligned axes, hidden series or independent subplots", () => {
    expect(
      getZeroAlignmentRelayout(
        layout([
          [-10, 100],
          [-4, 40],
        ]),
        traces,
        new Set(),
      ),
    ).toBeUndefined();
    const input = layout([
      [-10, 100],
      [0, 40],
    ]);
    for (const visible of [false, "legendonly"]) {
      expect(
        getZeroAlignmentRelayout(
          input,
          [traces[0], { ...traces[1], visible }],
          new Set(),
        ),
      ).toBeUndefined();
    }
    input.yaxis2 = { ...input.yaxis2, overlaying: undefined, domain: [0, 0.4] };
    expect(getZeroAlignmentRelayout(input, traces, new Set())).toBeUndefined();
  });

  test.each([
    { type: "log" },
    { type: "category" },
    { autorange: false },
    { autorange: "max" },
    { rangemode: "nonnegative" },
    { autorangeoptions: { clipmin: 0 } },
    { autorangeoptions: { maxallowed: 40 } },
    { matches: "y" },
    { scaleanchor: "y" },
  ] as Partial<Plotly.LayoutAxis>[])(
    "excludes incompatible or constrained axes: %j",
    (axis) => {
      const input = layout([
        [-10, 100],
        [0, 40],
      ]);
      input.yaxis2 = { ...input.yaxis2, ...axis };
      expect(
        getZeroAlignmentRelayout(input, traces, new Set()),
      ).toBeUndefined();
    },
  );

  test("protects explicit and template ranges and both ends of axis constraints", () => {
    const input: Partial<Plotly.Layout> = {
      template: { layout: { yaxis: { range: [-1, 10] } } },
      yaxis2: { range: [null, 20] },
      yaxis3: { scaleanchor: "y4" },
      xaxis: { matches: "x2" },
    };
    const protectedAxes = getZeroAlignmentProtectedAxes(input);
    expect([...protectedAxes]).toEqual(["yaxis", "yaxis2", "yaxis4", "xaxis2"]);
    expect(
      getZeroAlignmentRelayout(
        layout([
          [-10, 100],
          [0, 40],
        ]),
        traces,
        protectedAxes,
      ),
    ).toBeUndefined();
    expect(
      getZeroAlignmentProtectedAxes({
        yaxis: { autorangeoptions: { include: [0, 10] } },
      }).size,
    ).toBe(0);
  });

  test("ignores invalid or overflowing native ranges", () => {
    for (const range of [
      [0, 0],
      [NaN, 1],
      [-Infinity, 1],
      [-Number.MAX_VALUE, Number.MAX_VALUE],
    ]) {
      expect(
        getZeroAlignmentRelayout(layout([range, [0, 40]]), traces, new Set()),
      ).toBeUndefined();
    }
  });

  test("does not expand another axis to match a series without numeric values", () => {
    const input = layout([
      [1.8, 108],
      [-1, 4],
    ]);
    expect(
      getZeroAlignmentRelayout(
        input,
        [
          { yaxis: "y", y: [10, 50, 100] },
          {
            yaxis: "y2",
            y: [null, "", " ", "unavailable", "unknown", NaN, Infinity],
          },
        ],
        new Set(),
      ),
    ).toBeUndefined();
  });

  test("leaves hidden helper axes and the sole visible axis unchanged", () => {
    const input = layout([
      [19.7, 25.3],
      [-0.05, 1.05],
    ]);
    input.yaxis9 = { ...input.yaxis2, visible: false };
    delete input.yaxis2;
    expect(
      getZeroAlignmentRelayout(
        input,
        [
          { yaxis: "y", y: [20, 25] },
          { yaxis: "y9", y: [0, 1] },
        ],
        new Set(),
      ),
    ).toBeUndefined();
  });
});
