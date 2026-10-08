import filters, { FilterInput } from "./filters";

const RIGHT_1 = { integrate: { offset: "2d" } } satisfies FilterInput;
const RIGHT_11 = { integrate: "d" } satisfies FilterInput;
const RIGHT_2 = "integrate" satisfies FilterInput;
const RIGHT_3 = "delta" satisfies FilterInput;
const RIGHT_4 = "deduplicate_adjacent" satisfies FilterInput;
const RIGHT_5 = "force_numeric" satisfies FilterInput;
const RIGHT_6 = "resample" satisfies FilterInput;
const RIGHT_7 = { resample: "5m" } satisfies FilterInput;
const RIGHT_8 = { align_vars: "stored" } satisfies FilterInput;
const RIGHT_9 = { align_vars: ["one", "two"] } satisfies FilterInput;

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
    it("handles nonuniform intervals", () => {
      const xs = [0, 1, 3, 6].map(
        (s) => new Date(Date.UTC(2022, 11, 20, 0, 0, s)),
      );
      expect(
        filters.integrate("s")(input({ xs, ys: [1, 2, 3, 4] })).ys,
      ).toEqual([NaN, 1, 5, 14]);
    });

    describe("reset_every", () => {
      // Resets are aligned to local midnight of the current day. The clock has
      // nonzero milliseconds, which must not shift the reset boundaries.
      beforeEach(() => {
        jest.useFakeTimers({ now: new Date(2022, 11, 21, 12, 34, 56, 789) });
      });
      // local time on December <day> 2022
      const at = (day: number, hours: number, minutes = 0) =>
        new Date(2022, 11, day, hours, minutes);
      const integrate = (
        param: Parameters<typeof filters.integrate>[0],
        xs: Date[],
        ys: any[] = xs.map(() => 1),
      ) => filters.integrate(param)(input({ xs, ys })).ys;
      const daily = { unit: "h", reset_every: "1d" } as const;

      it("restarts at local midnight", () => {
        const xs = [at(20, 22), at(20, 23), at(21, 0), at(21, 1)];
        expect(integrate(daily, xs)).toEqual([NaN, 1, 0, 1]);
      });
      it("only counts the part of an interval after midnight", () => {
        const xs = [at(20, 23, 30), at(21, 0, 30), at(21, 1, 30)];
        expect(integrate(daily, xs)).toEqual([NaN, 0.5, 1.5]);
      });
      it("skips periods without samples", () => {
        const xs = [at(18, 23), at(20, 1), at(20, 2)];
        expect(integrate(daily, xs)).toEqual([NaN, 1, 2]);
      });
      it("shifts the reset by offset", () => {
        const xs = [at(20, 5), at(20, 7), at(20, 8)];
        expect(integrate(daily, xs)).toEqual([NaN, 2, 3]);
        expect(integrate({ ...daily, offset: "6h" }, xs)).toEqual([NaN, 1, 2]);
      });
      it("resets every hour", () => {
        const xs = [at(20, 10), at(20, 10, 30), at(20, 11), at(20, 11, 30)];
        expect(
          integrate({ unit: "h", reset_every: "1h" }, xs, [2, 2, 2, 2]),
        ).toEqual([NaN, 1, 0, 1]);
      });
      it("resets on the first numeric sample after midnight", () => {
        const xs = [at(20, 23), at(21, 0), at(21, 1)];
        expect(integrate(daily, xs, [1, "unavailable", 1])).toEqual([
          NaN,
          "unavailable",
          1,
        ]);
      });
      it("starts integrating at the first sample, not the period start", () => {
        expect(integrate(daily, [at(20, 12), at(20, 18)])).toEqual([NaN, 6]);
        // the current period, where no reset is detected on the first sample
        expect(integrate(daily, [at(21, 8), at(21, 10)])).toEqual([NaN, 2]);
      });

      describe("calendar days in the configured time zone", () => {
        const run = (
          timestamps: string[],
          timeZone = "Europe/Zurich",
          param: Parameters<typeof filters.integrate>[0] = daily,
        ) =>
          filters.integrate(param)(
            input({
              xs: timestamps.map((timestamp) => new Date(timestamp)),
              ys: timestamps.map(() => 1),
              timeZone,
            }),
          ).ys;

        it.each([
          [
            "spring",
            "2026-03-28T23:00Z",
            "2026-03-29T21:00Z",
            "2026-03-29T22:00Z",
            "2026-03-29T23:00Z",
            22,
          ],
          [
            "autumn",
            "2026-10-24T22:00Z",
            "2026-10-25T22:00Z",
            "2026-10-25T23:00Z",
            "2026-10-26T00:00Z",
            24,
          ],
        ])(
          "resets at midnight across the %s clock change",
          (_, start, before, midnight, after, hours) => {
            expect(run([start, before, midnight, after] as string[])).toEqual([
              NaN,
              hours,
              0,
              1,
            ]);
          },
        );

        it.each([
          [
            "2026-10-04T12:00Z",
            "2026-01-14T21:30Z",
            "2026-01-14T22:30Z",
            "2026-01-14T23:30Z",
          ],
          [
            "2026-01-15T12:00Z",
            "2026-07-14T20:30Z",
            "2026-07-14T21:30Z",
            "2026-07-14T22:30Z",
          ],
        ])(
          "uses each sample's day, not today's UTC offset (%s)",
          (now, ...timestamps) => {
            jest.setSystemTime(new Date(now));
            expect(run(timestamps)).toEqual([NaN, 1, 0.5]);
          },
        );

        it.each([
          [
            "2026-10-03T13:30Z",
            "2026-10-04T12:00Z",
            "2026-10-04T13:00Z",
            "2026-10-04T14:00Z",
            22.5,
          ],
          [
            "2026-04-04T13:00Z",
            "2026-04-05T12:30Z",
            "2026-04-05T13:30Z",
            "2026-04-05T14:30Z",
            23.5,
          ],
        ])(
          "handles a half-hour clock change (%s)",
          (start, before, midnight, after, hours) => {
            expect(
              run(
                [start, before, midnight, after] as string[],
                "Australia/Lord_Howe",
              ),
            ).toEqual([NaN, hours, 0, 1]);
          },
        );

        it("preserves fixed 24-hour intervals", () => {
          jest.setSystemTime(new Date("2026-03-29T12:00Z"));
          expect(
            run(
              [
                "2026-03-28T23:00Z",
                "2026-03-29T21:00Z",
                "2026-03-29T22:00Z",
                "2026-03-29T23:00Z",
              ],
              "Europe/Zurich",
              { unit: "h", reset_every: "24h" },
            ),
          ).toEqual([NaN, 22, 23, 0]);
        });

        it("keeps offset as elapsed time after calendar midnight", () => {
          expect(
            run(
              ["2026-03-29T03:30Z", "2026-03-29T05:30Z", "2026-03-29T06:30Z"],
              "Europe/Zurich",
              { ...daily, offset: "6h" },
            ),
          ).toEqual([NaN, 0.5, 1.5]);
        });

        it("supports negative offsets across a clock change", () => {
          expect(
            run(
              [
                "2026-03-28T21:00Z",
                "2026-03-29T19:00Z",
                "2026-03-29T20:00Z",
                "2026-03-29T21:00Z",
              ],
              "Europe/Zurich",
              { ...daily, offset: "-2h" },
            ),
          ).toEqual([NaN, 22, 0, 1]);
        });
      });
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

describe("resample", () => {
  const t0 = +new Date("2022-12-20T18:00:00.000Z");
  const series = (ys: (number | null)[]) =>
    input({ ys, xs: [0, 10, 20].map((s) => new Date(t0 + s * 1000)) });
  const at = (...s: number[]) => s.map((s) => new Date(t0 + s * 1000));
  it("holds the last value by default", () => {
    const result = filters.resample("5s")(series([0, 10, 40]));
    expect(result.xs).toEqual(at(0, 5, 10, 15));
    expect(result.ys).toEqual([0, 0, 10, 10]);
  });
  it("accepts an object without interpolate", () => {
    const result = filters.resample({ interval: "5s" })(series([0, 10, 40]));
    expect(result.ys).toEqual([0, 0, 10, 10]);
  });
  it("interpolates linearly between neighbours", () => {
    const result = filters.resample({ interval: "5s", interpolate: true })(
      series([0, 10, 40]),
    );
    expect(result.xs).toEqual(at(0, 5, 10, 15));
    expect(result.ys).toEqual([0, 5, 10, 25]);
  });
  it("holds the last value next to non-numeric values", () => {
    const result = filters.resample({ interval: "5s", interpolate: true })(
      series([0, null, 40]),
    );
    expect(result.ys).toEqual([0, 0, null, null]);
  });
});

describe("align_vars", () => {
  const at = (...minutes: number[]) =>
    minutes.map((minute) => new Date(Date.UTC(2025, 0, 1, 0, minute)));
  const saved = (minutes: number[], ys: any[]) => ({
    xs: at(...minutes),
    ys,
    states: ys.map((_, i) => ({ state: `state ${i}` })),
    statistics: ys.map((_, i) => ({ mean: i })),
    meta: { unit_of_measurement: "Wh" },
  });

  it("matches periods rather than indexes and preserves the original series", () => {
    const source = saved([5, 15, 20], [0, 30, 40]);
    const original = structuredClone(source);
    const data = input({
      xs: at(0, 5, 10, 15),
      ys: [10, 20, 30, 40],
      vars: { source, unrelated: "keep" },
    });
    const { vars } = filters.align_vars("source")(data);
    expect(vars!.aligned.source).toEqual({
      xs: data.xs,
      ys: [null, 0, null, 30],
      states: [null, source.states[0], null, source.states[1]],
      statistics: [null, source.statistics[0], null, source.statistics[1]],
      meta: source.meta,
    });
    expect(vars!.source).toBe(source);
    expect(vars!.unrelated).toBe("keep");
    expect(source).toEqual(original);
    expect(data.vars).not.toHaveProperty("aligned");
    expect(data.xs).toEqual(at(0, 5, 10, 15));
    expect(data.ys).toEqual([10, 20, 30, 40]);
  });

  it("supports multiple series and can align them again to a different trace", () => {
    const a = saved([0, 5, 10], [1, 2, 3]);
    const b = saved([5, 10, 15], [4, 5, 6]);
    const first = filters.align_vars(["a", "b"])(
      input({
        xs: at(0, 5, 10),
        vars: { a, b },
      }),
    );
    expect(first.vars!.aligned.a.ys).toEqual([1, 2, 3]);
    expect(first.vars!.aligned.b.ys).toEqual([null, 4, 5]);
    const second = filters.align_vars("b")(
      input({ xs: at(10, 15), vars: first.vars }),
    );
    expect(second.vars!.aligned.b.ys).toEqual([5, 6]);
    expect(second.vars!.aligned).not.toHaveProperty("a");
    expect(first.vars!.aligned.b.ys).toEqual([null, 4, 5]);
    expect(b.xs).toEqual(at(5, 10, 15));
  });

  it("handles unordered timestamps, equivalent dates and duplicate updates", () => {
    const source = {
      ...saved([10, 0, 5, 5], [3, 1, 2, 4]),
      states: [],
      statistics: [],
    };
    const data = input({ xs: at(5, 0, 10, 5), vars: { source } });
    const { vars } = filters.align_vars("source")(data);
    expect(vars!.aligned.source.ys).toEqual([4, 1, 3, 4]);
    expect(vars!.aligned.source.states).toEqual([]);
    expect(vars!.aligned.source.statistics).toEqual([]);
  });

  it("does not interpolate, round timestamps or replace explicit gaps with zero", () => {
    const source = saved([0, 5, 10], [0, null, "unavailable"]);
    const data = input({
      xs: [...at(0), new Date(+at(5)[0] + 1), ...at(5, 10)],
      vars: { source },
    });
    expect(filters.align_vars("source")(data).vars!.aligned.source.ys).toEqual([
      0,
      null,
      null,
      "unavailable",
    ]);
  });

  it("returns missing values for an empty stored series", () => {
    const { vars } = filters.align_vars("empty")(
      input({
        xs: at(0, 5),
        vars: { empty: saved([], []) },
      }),
    );
    expect(vars!.aligned.empty.ys).toEqual([null, null]);
    expect(vars!.aligned.empty.states).toEqual([]);
  });

  it("matches absolute instants across timezones and repeated daylight-saving hours", () => {
    const source = {
      ...saved([0, 5], [1, 2]),
      xs: [
        new Date("2025-10-26T02:30:00+02:00"),
        new Date("2025-10-26T02:30:00+01:00"),
      ],
    };
    const data = input({
      xs: [new Date("2025-10-26T00:30:00Z"), new Date("2025-10-26T01:30:00Z")],
      vars: { source },
      timeZone: "Europe/Zurich",
    });
    expect(filters.align_vars("source")(data).vars!.aligned.source.ys).toEqual([
      1, 2,
    ]);
  });

  it("handles an empty target and variable names that overlap object properties", () => {
    const source = saved([0], [1]);
    const vars = { ["__proto__"]: source };
    const aligned = filters.align_vars("__proto__")(input({ xs: at(0), vars }));
    expect(Object.hasOwn(aligned.vars!.aligned, "__proto__")).toBe(true);
    expect(aligned.vars!.aligned.__proto__.ys).toEqual([1]);
    const empty = filters.align_vars("__proto__")(input({ xs: [], vars }));
    expect(empty.vars!.aligned.__proto__.xs).toEqual([]);
    expect(empty.vars!.aligned.__proto__.ys).toEqual([]);
    expect(empty.vars!.aligned.__proto__.states).toEqual([]);
  });

  it("combines only corresponding periods through map_y", () => {
    const data = input({
      xs: at(0, 5, 10),
      ys: [10, 20, 30],
      vars: { other: saved([5, 10], [3, 7]) },
    });
    const aligned = filters.align_vars("other")(data);
    const result = filters.map_y(
      "vars.aligned.other.ys[i] === null ? null : y - vars.aligned.other.ys[i]",
    )({ ...data, ...aligned });
    expect(result.xs).toEqual(at(0, 5, 10));
    expect(result.ys).toEqual([null, 17, 23]);
  });

  it.each([
    [undefined, "not a stored series"],
    [{ xs: at(0), ys: [] }, "different x/y lengths"],
    [{ xs: [new Date(NaN)], ys: [1] }, "invalid timestamp"],
  ])("reports unusable stored series", (source, message) => {
    expect(() =>
      filters.align_vars("source")(input({ vars: { source } })),
    ).toThrow(message);
  });

  it("rejects invalid target timestamps", () => {
    expect(() =>
      filters.align_vars("source")(
        input({
          xs: [new Date(NaN)],
          vars: { source: saved([0], [1]) },
        }),
      ),
    ).toThrow("requires valid timestamps");
  });
});
