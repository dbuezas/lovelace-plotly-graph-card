import { setDefaultOptions } from "date-fns";
import filters from "./filters";
import type { TimeDurationStr } from "../duration/duration";

function integrate(
  reset_every: TimeDurationStr,
  dates: string[],
  offset?: TimeDurationStr,
) {
  return filters.integrate({ unit: "h", reset_every, offset })({
    xs: dates.map((date) => new Date(date)),
    ys: dates.map(() => 1),
    states: [],
    statistics: [],
    meta: {},
    vars: {},
    hass: {} as any,
    timeZone: "Europe/Zurich",
  }).ys;
}

describe("calendar integration resets", () => {
  afterEach(() => setDefaultOptions({ weekStartsOn: undefined }));

  it("shares the stable two-day grid and integrates actual elapsed hours across DST", () => {
    expect(
      integrate("2d", [
        "2024-03-30T00:00:00+01:00",
        "2024-03-31T23:00:00+02:00",
        "2024-04-01T00:00:00+02:00",
        "2024-04-01T01:00:00+02:00",
      ]),
    ).toEqual([NaN, 46, 0, 1]);
  });

  it("preserves offsets as elapsed time after a multi-day reset", () => {
    expect(
      integrate(
        "2d",
        [
          "2024-03-31T23:00:00+02:00",
          "2024-04-01T05:00:00+02:00",
          "2024-04-01T07:00:00+02:00",
        ],
        "6h",
      ),
    ).toEqual([NaN, 6, 1]);
  });

  it.each([
    [1, "2024-04-01T00:30:00+02:00"],
    [0, "2024-03-31T00:30:00+01:00"],
  ] as const)(
    "resets at the configured first weekday (%s)",
    (weekStartsOn, after) => {
      setDefaultOptions({ weekStartsOn });
      const before = new Date(Date.parse(after) - 3600000).toISOString();
      expect(integrate("1w", [before, after])).toEqual([NaN, 0.5]);
    },
  );

  it("resets at the first of the month, including leap February", () => {
    expect(
      integrate("1M", [
        "2024-01-31T23:30:00+01:00",
        "2024-02-01T00:30:00+01:00",
        "2024-02-29T23:30:00+01:00",
        "2024-03-01T00:30:00+01:00",
      ]),
    ).toEqual([NaN, 0.5, 695.5, 0.5]);
  });

  it("groups whole calendar months rather than fixed 30-day periods", () => {
    expect(
      integrate("2M", [
        "2024-02-01T00:00:00+01:00",
        "2024-02-29T23:00:00+01:00",
        "2024-03-01T01:00:00+01:00",
      ]),
    ).toEqual([NaN, 695, 1]);
  });

  it("keeps fractional day resets as fixed durations", () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2024-03-30T12:00:00+01:00"));
    try {
      expect(
        integrate("1.5d", [
          "2024-03-30T00:00:00+01:00",
          "2024-03-31T13:00:00+02:00",
          "2024-03-31T14:00:00+02:00",
        ]),
      ).toEqual([NaN, 0, 1]);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
