import filters, { FilterInput } from "./filters";

const RIGHT_1 = { integrate: { offset: "2d" } } satisfies FilterInput;
const RIGHT_11 = { integrate: "d" } satisfies FilterInput;
const RIGHT_2 = "integrate" satisfies FilterInput;
const RIGHT_3 = "delta" satisfies FilterInput;
const RIGHT_4 = "deduplicate_adjacent" satisfies FilterInput;
const RIGHT_5 = "force_numeric" satisfies FilterInput;
const RIGHT_6 = "resample" satisfies FilterInput;
const RIGHT_7 = { resample: "5m" } satisfies FilterInput;

//@ts-expect-error
const WRONG_1 = "add" satisfies FilterInput;
//@ts-expect-error
const WRONG_2 = { integrate: 3 } satisfies FilterInput;

const date = (s: string) => new Date(`2022-12-20T18:07:${s}Z`);

// Filters get the same object the card builds in parse-config.ts (fnParam).
// A fresh one per call, so filters that mutate their input can't leak into
// other tests.
const input = (overrides: Record<string, any> = {}): any => {
  const ys = overrides.ys ?? [0, 1, null, 2];
  return {
    ys,
    xs: ["28.000", "29.000", "29.500", "30.000"].map(date),
    states: ys.map((_, i) => ({ state: `state ${i}` })),
    statistics: ys.map((_, i) => ({ mean: i })),
    meta: { unit_of_measurement: "w" },
    vars: {},
    hass: {},
    ...overrides,
  };
};
// Same timestamps as input(), without the non numeric datapoint.
const numericXs = [date("28.000"), date("29.000"), date("30.000")];
const secondsApart = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => new Date(Date.UTC(2022, 11, 20, 0, 0, i)),
  );

describe("filters", () => {
  it("force_numeric", () => {
    const data = input({ ys: [0, "1", null, "2.5", "unavailable"] });
    data.xs = secondsApart(5);
    expect(filters.force_numeric()(data)).toMatchObject({
      ys: [0, 1, 2.5],
      xs: [data.xs[0], data.xs[1], data.xs[3]],
      states: [data.states[0], data.states[1], data.states[3]],
      statistics: [data.statistics[0], data.statistics[1], data.statistics[3]],
    });
  });
  it("add", () => {
    expect(filters.add(-1)(input())).toEqual({ ys: [-1, 0, null, 1] });
  });
  it("multiply", () => {
    expect(filters.multiply(2)(input())).toEqual({ ys: [0, 2, null, 4] });
  });
  it("calibrate_linear", () => {
    const { ys, meta } = filters.calibrate_linear(["1 -> 11", "11 -> 21"])(
      input(),
    );
    expect(ys).toEqual([10, 11, NaN, 12]);
    expect(meta).toMatchObject({ unit_of_measurement: "w" });
    expect(meta).toHaveProperty("regression");
  });
  it("deduplicate_adjacent", () => {
    const data = input({ ys: [1, 1, 2, 1] });
    expect(filters.deduplicate_adjacent()(data)).toEqual({
      ys: [1, 2, 1],
      xs: [data.xs[0], data.xs[2], data.xs[3]],
      states: [data.states[0], data.states[2], data.states[3]],
      statistics: [data.statistics[0], data.statistics[2], data.statistics[3]],
    });
  });
  it("delta", () => {
    const data = input();
    expect(filters.delta()(data)).toEqual({
      meta: { unit_of_measurement: "Δw" },
      ys: [1, null, 1],
      xs: data.xs.slice(1),
      states: data.states.slice(1),
      statistics: data.statistics.slice(1),
    });
  });
  it("derivate", () => {
    const data = input();
    expect(filters.derivate("s")(data)).toEqual({
      meta: { unit_of_measurement: "w/s" },
      xs: data.xs,
      ys: [NaN, 1, null, 1],
    });
  });
  it("derivate rejects unknown units", () => {
    expect(() => filters.derivate("parsec" as any)(input())).toThrow(
      "Unit 'parsec' is not valid",
    );
  });

  describe("integrate", () => {
    afterEach(() => jest.useRealTimers());

    it("skips non numeric values", () => {
      const data = input();
      expect(filters.integrate("s")(data)).toEqual({
        meta: { unit_of_measurement: "ws" },
        xs: data.xs,
        ys: [NaN, 0, null, 1],
      });
    });
    it("includes the first interval", () => {
      const xs = secondsApart(3);
      expect(filters.integrate("s")(input({ xs, ys: [5, 5, 5] })).ys).toEqual([
        NaN,
        5,
        10,
      ]);
    });
    it("defaults to hours", () => {
      const xs = [0, 1, 2].map((h) => new Date(Date.UTC(2022, 11, 20, h)));
      expect(filters.integrate()(input({ xs, ys: [2, 2, 2] }))).toMatchObject({
        meta: { unit_of_measurement: "wh" },
        ys: [NaN, 2, 4],
      });
    });
    it("reset_every restarts at local midnight", () => {
      jest.useFakeTimers({ now: new Date(2022, 11, 21, 12) });
      const xs = [22, 23, 24, 25].map((h) => new Date(2022, 11, 20, h));
      const integrate = filters.integrate({ unit: "h", reset_every: "1d" });
      expect(integrate(input({ xs, ys: [1, 1, 1, 1] })).ys).toEqual([
        NaN,
        1,
        1,
        2,
      ]);
    });
  });

  it("sliding_window_moving_average", () => {
    const data = input({ ys: [0, 1, 2], xs: secondsApart(3) });
    expect(
      filters.sliding_window_moving_average({
        window_size: 2,
        centered: false,
      })(data),
    ).toMatchObject({ ys: [0.5, 1.5], xs: data.xs.slice(1) });
    expect(
      filters.sliding_window_moving_average({ window_size: 2 })(data),
    ).toMatchObject({
      ys: [0.5, 1.5],
      xs: [new Date(+data.xs[0] + 500), new Date(+data.xs[1] + 500)],
    });
  });
  it("sliding_window_moving_average extended", () => {
    const data = input({ ys: [0, 1, 2], xs: secondsApart(3) });
    const extended = (centered: boolean) =>
      filters.sliding_window_moving_average({
        window_size: 2,
        extended: true,
        centered,
      })(data);
    expect(extended(false)).toMatchObject({
      ys: [0, 0.5, 1.5],
      xs: data.xs,
    });
    expect(extended(true)).toMatchObject({
      ys: [0, 0.5, 1.5, 2],
      xs: [
        data.xs[0],
        new Date(+data.xs[0] + 500),
        new Date(+data.xs[1] + 500),
        data.xs[2],
      ],
    });
  });
  it("median", () => {
    const data = input({ ys: [10, 9, 100, 1, 50, 2], xs: secondsApart(6) });
    // odd window sizes pick the middle value (sorting numerically)
    expect(
      filters.median({ window_size: 3, centered: false })(data),
    ).toMatchObject({ ys: [10, 9, 50, 2], xs: data.xs.slice(2) });
    // even window sizes average the two middle values
    expect(
      filters.median({ window_size: 2, centered: false })(data).ys,
    ).toEqual([9.5, 54.5, 50.5, 25.5, 26]);
  });
  it("exponential_moving_average", () => {
    const data = input();
    expect(
      filters.exponential_moving_average({ alpha: 0.5 })(data),
    ).toMatchObject({ ys: [0, 0.5, 1.25], xs: numericXs });
  });

  it("map_y receives every datapoint", () => {
    const data = input();
    expect(filters.map_y(`y ?? "missing"`)(data)).toEqual({
      xs: data.xs,
      ys: [0, 1, "missing", 2],
    });
    expect(filters.map_y(`i + meta.unit_of_measurement`)(data).ys).toEqual([
      "0w",
      "1w",
      "2w",
      "3w",
    ]);
  });
  it("map_y_numbers skips non numeric values", () => {
    const data = input();
    expect(filters.map_y_numbers(`Math.sqrt(y)`)(data)).toEqual({
      xs: data.xs,
      ys: [0, 1, null, Math.SQRT2],
    });
  });
  it("map_x", () => {
    const data = input();
    expect(filters.map_x(`new Date(+x + 1000)`)(data)).toEqual({
      ys: data.ys,
      xs: ["29.000", "30.000", "30.500", "31.000"].map(date),
    });
  });
  it("filter", () => {
    const data = input();
    expect(filters.filter(`y !== null && y > 0`)(data)).toEqual({
      ys: [1, 2],
      xs: [data.xs[1], data.xs[3]],
      states: [data.states[1], data.states[3]],
      statistics: [data.statistics[1], data.statistics[3]],
    });
  });
  it("resample", () => {
    const data = input();
    expect(filters.resample("500ms")(data)).toEqual({
      xs: ["28.000", "28.500", "29.000", "29.500"].map(date),
      ys: [0, 0, 1, null],
      states: [0, 0, 1, 2].map((i) => data.states[i]),
      statistics: [0, 0, 1, 2].map((i) => data.statistics[i]),
    });
  });
  it("store_var and load_var", () => {
    const data = input();
    const { vars } = filters.store_var("stored")(data);
    expect(vars).toEqual({
      stored: {
        xs: data.xs,
        ys: data.ys,
        states: data.states,
        statistics: data.statistics,
        meta: data.meta,
      },
    });
    expect(filters.load_var("stored")(input({ vars }))).toBe(vars!.stored);
  });
  it("trendline", () => {
    const xs = secondsApart(4);
    const {
      ys,
      xs: xsOut,
      meta,
    } = filters.trendline({
      type: "linear",
      show_formula: true,
    })(input({ xs, ys: [1, 3, 5, 7] }));
    expect(xsOut).toEqual(xs);
    ys!.forEach((y, i) => expect(y).toBeCloseTo(1 + 2 * i));
    expect(meta!.friendly_name).toMatch(/^Trend \(.+\)$/);
  });
  it("trendline suggests the closest type", () => {
    expect(() => filters.trendline("linaer" as any)(input())).toThrow(
      "Did you mean <b>linear<b>?",
    );
  });
  it("fn", () => {
    const data = input();
    expect(
      filters.fn(`({xs, ys, ...rest}) => ({xs: ys, ys: xs, ...rest})`)(data),
    ).toEqual({ ...data, xs: data.ys, ys: data.xs });
  });
});
