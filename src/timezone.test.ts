import {
  resolveTimeZone,
  toPlotlyDateString,
  toPlotlyTimeZone,
} from "./timezone";
import { parseRelativeTime } from "./duration/duration";
import { tz as inZone, tzOffset } from "@date-fns/tz";
import { endOfWeek, parseISO, setDefaultOptions, startOfWeek } from "date-fns";

const hass = (time_zone: string, server = "Pacific/Chatham") =>
  ({ locale: { time_zone }, config: { time_zone: server } }) as any;

describe("resolveTimeZone", () => {
  it("follows the Home Assistant profile setting by default", () => {
    expect(resolveTimeZone(undefined, hass("server"))).toBe("Pacific/Chatham");
    expect(resolveTimeZone(undefined, hass("local"))).toBeUndefined();
    expect(resolveTimeZone(undefined, undefined)).toBeUndefined();
  });
  it("lets the card config override it", () => {
    expect(resolveTimeZone("local", hass("server"))).toBeUndefined();
    expect(resolveTimeZone("server", hass("local"))).toBe("Pacific/Chatham");
    expect(resolveTimeZone("Pacific/Auckland", hass("server"))).toBe(
      "Pacific/Auckland",
    );
  });
  it("skips the conversion when it matches the browser", () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveTimeZone(browser, undefined)).toBeUndefined();
  });
  it("rejects unknown timezones", () => {
    expect(() => resolveTimeZone("Mars/Olympus", undefined)).toThrow(
      "Mars/Olympus",
    );
  });
});

describe("wall clock conversion", () => {
  it("formats timestamps as wall clock strings across DST", () => {
    const rome = "Europe/Rome";
    expect(toPlotlyDateString(Date.UTC(2024, 2, 31, 0, 59, 59), rome)).toBe(
      "2024-03-31 01:59:59.000",
    );
    expect(toPlotlyDateString(Date.UTC(2024, 2, 31, 1), rome)).toBe(
      "2024-03-31 03:00:00.000",
    );
    expect(toPlotlyDateString(Date.UTC(2024, 9, 27, 0, 30), rome)).toBe(
      "2024-10-27 02:30:00.000",
    );
    expect(toPlotlyDateString(Date.UTC(2024, 9, 27, 1, 30), rome)).toBe(
      "2024-10-27 02:30:00.000",
    );
    expect(toPlotlyDateString(Date.UTC(2024, 5, 1, 12), "Asia/Kolkata")).toBe(
      "2024-06-01 17:30:00.000",
    );
  });
  it("matches tzOffset exactly around transitions", () => {
    // Offsets are cached per hour; transitions must stay exact,
    // including Lord Howe's 30 minute DST.
    for (const [tz, from] of [
      ["Europe/Rome", Date.UTC(2024, 2, 31, 0)],
      ["Australia/Lord_Howe", Date.UTC(2024, 9, 5, 15)],
      ["Australia/Lord_Howe", Date.UTC(2024, 3, 6, 14)],
    ] as const)
      for (let t = from; t < from + 2 * 3600e3; t += 7e3) {
        const offset = tzOffset(tz, new Date(t)) * 60e3;
        const expected = new Date(t + offset)
          .toISOString()
          .replace("T", " ")
          .slice(0, -1);
        expect(toPlotlyDateString(t, tz)).toBe(expected);
      }
  });
  // Can fail when the machine's own timezone has DST gaps (e.g. TZ=Australia/Lord_Howe):
  // https://github.com/date-fns/tz/pull/79
  it("round trips timestamps around DST changes", () => {
    const day = 24 * 3600e3;
    for (const tz of [
      "Europe/Rome",
      "America/New_York",
      "Australia/Lord_Howe",
    ]) {
      // an ordinary day, plus the two days of 2024 where the offset changes
      const days = [Date.UTC(2024, 0, 15)];
      for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += day)
        if (tzOffset(tz, new Date(t)) !== tzOffset(tz, new Date(t + day)))
          days.push(t);
      expect(days).toHaveLength(3);
      for (const start of days)
        for (let t = start; t < start + day; t += 13 * 60e3) {
          const str = toPlotlyDateString(t, tz);
          const back = +parseISO(str, { in: inZone(tz) });
          // ambiguous wall times (DST fall back) may resolve to either instant
          expect(toPlotlyDateString(back, tz)).toBe(str);
        }
    }
  });
});

describe("relative times", () => {
  it("computes day boundaries in the given timezone", () => {
    const tz = "Pacific/Auckland";
    const [start, end] = parseRelativeTime("current_day", tz);
    expect(toPlotlyDateString(start, tz)).toMatch(/ 00:00:00\.000$/);
    expect(toPlotlyDateString(end, tz)).toMatch(/ 23:59:59\.999$/);
    expect(start).toBeLessThanOrEqual(Date.now());
    expect(end).toBeGreaterThanOrEqual(Date.now());
  });
  it("matches date-fns when no timezone is given", () => {
    const [start, end] = parseRelativeTime("current_week");
    expect(start).toBe(+startOfWeek(Date.now()));
    expect(end).toBe(+endOfWeek(Date.now()));
  });
  it.each([
    ["current_week", "2024-02-26 00:00:00.000", "2024-03-03 23:59:59.999"],
    ["current_month", "2024-02-01 00:00:00.000", "2024-02-29 23:59:59.999"],
    ["current_quarter", "2024-01-01 00:00:00.000", "2024-03-31 23:59:59.999"],
    ["current_year", "2024-01-01 00:00:00.000", "2024-12-31 23:59:59.999"],
  ] as const)("computes %s boundaries", (str, from, to) => {
    // Thursday 2024-02-29 23:30 in Kolkata
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2024, 1, 29, 18));
    setDefaultOptions({ weekStartsOn: 1 });
    const tz = "Asia/Kolkata";
    const [start, end] = parseRelativeTime(str, tz);
    expect(toPlotlyDateString(start, tz)).toBe(from);
    expect(toPlotlyDateString(end, tz)).toBe(to);
    setDefaultOptions({});
    vi.restoreAllMocks();
  });
});

describe("toPlotlyTimeZone", () => {
  const t = Date.UTC(2024, 5, 1, 12);
  const parsed = {
    entities: [{ x: [new Date(t)], y: [1], on_click: () => {} }],
    layout: {
      xaxis: { type: "date", range: [t, t + 3600000] },
      xaxis2: { type: "linear", range: [0, 1] },
      shapes: [{ x0: new Date(t), x1: "2024-06-01 00:00" }],
    },
  };
  it("leaves everything untouched without a timezone", () => {
    expect(toPlotlyTimeZone(parsed, undefined)).toBe(parsed);
  });
  it("converts dates and date axis ranges", () => {
    const result = toPlotlyTimeZone(parsed, "Asia/Tokyo");
    expect(result.entities[0].x).toEqual(["2024-06-01 21:00:00.000"]);
    expect(result.entities[0].y).toEqual([1]);
    expect(result.entities[0].on_click).toBe(parsed.entities[0].on_click);
    expect(result.layout.xaxis.range).toEqual([
      "2024-06-01 21:00:00.000",
      "2024-06-01 22:00:00.000",
    ]);
    expect(result.layout.xaxis2.range).toEqual([0, 1]);
    expect(result.layout.shapes[0]).toEqual({
      x0: "2024-06-01 21:00:00.000",
      x1: "2024-06-01 00:00",
    });
    // the input is not mutated
    expect(parsed.entities[0].x[0]).toBeInstanceOf(Date);
    expect(parsed.layout.xaxis.range[0]).toBe(t);
  });
  it("leaves numbers outside date axis ranges alone", () => {
    const parsed = {
      entities: [
        { x: [t, t], y: [0, 1] },
        { type: "scatter3d", x: [1, 2], y: [1, 2], z: [1, 2] },
      ],
      layout: {
        xaxis: { type: "date" },
        shapes: [{ xsizemode: "pixel", xanchor: t, x0: -2, x1: 2 }],
        annotations: [{ x: t }],
      },
    };
    const result = toPlotlyTimeZone(parsed, "Asia/Tokyo");
    expect(result.entities).toEqual(parsed.entities);
    expect(result.layout.shapes).toEqual(parsed.layout.shapes);
    expect(result.layout.annotations).toEqual(parsed.layout.annotations);
  });
});
