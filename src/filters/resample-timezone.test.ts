import filters from "./filters";
import { toPlotlyDateString } from "../timezone";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const dates = (xs: string[]) => xs.map((x) => new Date(x));
const input = (xs: Date[], timeZone?: string) => ({
  xs,
  ys: xs.map((_, i) => i + 1),
  states: xs.map((_, i) => ({ state: String(i + 1) })),
  statistics: xs.map((_, i) => ({ mean: i + 1 })),
  meta: {},
  vars: {},
  hass: {},
  timeZone: timeZone ?? "America/Phoenix",
});
const stamps = (xs: Date[] | undefined) => xs?.map((x) => x.toISOString());

describe("calendar resampling", () => {
  it("aligns daily samples with the configured midnight instead of UTC (#384)", () => {
    const data = input(
      dates([
        "2024-03-05T00:00:00-07:00",
        "2024-03-06T00:00:00-07:00",
        "2024-03-07T00:00:00-07:00",
      ]),
    );
    const result = filters.resample("1d")(data as any);

    expect(stamps(result.xs)).toEqual([
      "2024-03-05T07:00:00.000Z",
      "2024-03-06T07:00:00.000Z",
    ]);
    expect(result.ys).toEqual([1, 2]);
  });

  it.each([
    ["2024-03-30T00:00:00+01:00", "2024-04-02T00:00:00+02:00", [24, 23]],
    ["2024-10-26T00:00:00+02:00", "2024-10-29T00:00:00+01:00", [24, 25]],
  ])("follows historic DST boundaries from %s", (start, end, lengths) => {
    const data = input(
      dates([start as string, end as string]),
      "Europe/Zurich",
    );
    const result = filters.resample("1d")(data as any);
    const xs = result.xs!;
    expect(xs).toHaveLength(3);
    expect(xs.slice(1).map((x, i) => (+x - +xs[i]) / HOUR)).toEqual(lengths);
    expect(
      xs.map((x) => toPlotlyDateString(+x, "Europe/Zurich").slice(11)),
    ).toEqual(Array(3).fill("00:00:00.000"));
  });

  it("interpolates using elapsed time across a 23-hour day", () => {
    const data = input(
      dates(["2024-03-30T00:00:00+01:00", "2024-04-01T00:00:00+02:00"]),
      "Europe/Zurich",
    );
    data.ys = [0, 47];
    const result = filters.resample({ interval: "1d", interpolate: true })(
      data as any,
    );
    expect(result.ys).toEqual([0, 24]);
  });

  it("returns to midnight after a timezone skips the midnight hour", () => {
    const result = filters.resample("1d")(
      input(
        dates(["2019-09-06T00:00:00-04:00", "2019-09-11T00:00:00-03:00"]),
        "America/Santiago",
      ) as any,
    );
    expect(stamps(result.xs)).toEqual([
      "2019-09-06T04:00:00.000Z",
      "2019-09-07T04:00:00.000Z",
      "2019-09-08T04:00:00.000Z",
      "2019-09-09T03:00:00.000Z",
      "2019-09-10T03:00:00.000Z",
    ]);
  });

  it("aligns multi-day intervals to a stable local calendar anchor", () => {
    const data = input(
      dates(["1970-01-02T00:00:00-07:00", "1970-01-06T00:00:00-07:00"]),
    );
    const result = filters.resample("2d")(data as any);
    expect(stamps(result.xs)).toEqual([
      "1970-01-01T07:00:00.000Z",
      "1970-01-03T07:00:00.000Z",
      "1970-01-05T07:00:00.000Z",
    ]);
  });

  it.each([
    [
      "1d",
      ["2011-12-28", "2011-12-29", "2011-12-31", "2012-01-01", "2012-01-02"],
    ],
    ["2d", ["2011-12-28", "2011-12-31", "2012-01-01"]],
  ] as const)(
    "keeps the %s grid aligned when a timezone skips a whole date",
    (interval, expected) => {
      const result = filters.resample(interval)(
        input(
          dates(["2011-12-28T00:00:00-10:00", "2012-01-03T00:00:00+14:00"]),
          "Pacific/Apia",
        ) as any,
      );
      expect(
        result.xs?.map((x) => toPlotlyDateString(+x, "Pacific/Apia")),
      ).toEqual(expected.map((day) => `${day} 00:00:00.000`));
      expect(result.xs?.every((x, i, xs) => i === 0 || +x > +xs[i - 1])).toBe(
        true,
      );
    },
  );

  it.each(["24h", "5m", "1.5d", "1w"] as const)(
    "keeps %s as a fixed epoch-aligned interval",
    (interval) => {
      const data = input(
        dates(["2024-03-30T00:00:00+01:00", "2024-04-02T00:00:00+02:00"]),
        "Europe/Zurich",
      );
      const duration = {
        "24h": DAY,
        "5m": 300000,
        "1.5d": 1.5 * DAY,
        "1w": 7 * DAY,
      }[interval];
      const result = filters.resample(interval)(data as any);
      const xs = result.xs!;
      expect(+xs[0]).toBe(Math.floor(+data.xs[0] / duration) * duration);
      expect(xs.every((x) => +x % duration === 0)).toBe(true);
    },
  );

  it("returns empty arrays for empty input", () => {
    expect(filters.resample("1d")(input([]) as any)).toEqual({
      xs: [],
      ys: [],
      states: [],
      statistics: [],
    });
  });

  it.each(["0", "0d", "-1d", "-5m"] as const)(
    "rejects %s instead of entering a non-advancing loop",
    (interval) => {
      expect(() => filters.resample(interval)).toThrow(
        "resample: interval must be greater than zero",
      );
    },
  );
});
