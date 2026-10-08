import type { HomeAssistant } from "custom-card-helpers";
import type { StatisticPeriod } from "../recorder-types";
import type { EntityIdStatisticsConfig, TimestampRange } from "../types";
import Cache from "./Cache";
import { isLiveStatisticsRange } from "./statistics-refresh";

const hour = 3600000;
const start = Date.parse("2026-10-03T00:00:00Z");
const entity = (period: StatisticPeriod): EntityIdStatisticsConfig => ({
  entity: "sensor.energy",
  statistic: "mean",
  period,
});
const row = (start: number, end: number, mean: number) => ({
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
  mean,
});
function mockHass(rows: ReturnType<typeof row>[]) {
  const callWS = jest.fn(async ({ statistic_ids }) =>
    Object.fromEntries(statistic_ids.map((id: string) => [id, rows])),
  );
  return { callWS, hass: { callWS } as unknown as HomeAssistant };
}

describe("mutable statistics cache ranges", () => {
  let now: jest.SpyInstance;
  beforeEach(() => {
    now = jest.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(["single", "batched"])(
    "retries late 5minute rows through the %s path",
    async (path) => {
      const initialNow = start + 12 * hour + 7 * 60000;
      now.mockReturnValue(initialNow);
      const cache = new Cache();
      const config = entity("5minute");
      const rows = [row(start + 12 * hour, start + 12 * hour + 5 * 60000, 1)];
      const { hass, callWS } = mockHass(rows);
      const fetch = (end: number) =>
        path === "single"
          ? cache.fetch([start, end], config, hass)
          : cache.prefetchStatistics(
              [{ entity: config, range: [start, end] }],
              hass,
            );
      await fetch(initialNow);
      rows.push(
        row(start + 12 * hour + 5 * 60000, start + 12 * hour + 10 * 60000, 2),
      );
      const nextNow = start + 12 * hour + 12 * 60000;
      now.mockReturnValue(nextNow);
      await cache.refreshStatistics(nextNow);
      expect(cache.getData(config).ys).toEqual([1]);
      await fetch(nextNow);
      expect(cache.getData(config).ys).toEqual([1, 2]);
      expect(Date.parse(callWS.mock.calls[1][0].start_time)).toBe(
        start + 12 * hour + 5 * 60000 - 1,
      );
      await fetch(nextNow);
      expect(callWS).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ["day", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
    ["day", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
    ["week", "2026-03-22T23:00:00Z", "2026-03-29T22:00:00Z"],
    ["month", "2026-02-28T23:00:00Z", "2026-03-31T22:00:00Z"],
  ] as const)(
    "refreshes a partial %s using HA's supplied boundaries: %s",
    async (period, first, last) => {
      const firstTime = Date.parse(first);
      const lastTime = Date.parse(last);
      const initialNow = firstTime + 12 * hour;
      now.mockReturnValue(initialNow);
      const rows = [row(firstTime, lastTime, 1)];
      const { hass, callWS } = mockHass(rows);
      const config = entity(period);
      const cache = new Cache();
      await cache.fetch([firstTime, initialNow], config, hass);
      rows[0] = row(firstTime, lastTime, 2);
      now.mockReturnValue(initialNow + hour);
      await cache.refreshStatistics(Date.now());
      await cache.fetch([firstTime, Date.now()], config, hass);
      expect(cache.getData(config).ys).toEqual([2]);
      expect(cache.getData(config).statistics[0].end).toBe(
        new Date(last).toISOString(),
      );
      expect(Date.parse(callWS.mock.calls[1][0].start_time)).toBe(
        firstTime - 1,
      );
    },
  );

  it("retries an empty live response after statistics become available", async () => {
    const config = entity("hour");
    const cache = new Cache();
    const rows: ReturnType<typeof row>[] = [];
    const { hass, callWS } = mockHass(rows);
    await cache.fetch([start, Date.now()], config, hass);
    rows.push(row(start + 10 * hour, start + 11 * hour, 3));
    now.mockReturnValue(Date.now() + hour);
    await cache.refreshStatistics(Date.now());
    await cache.fetch([start, Date.now()], config, hass);
    expect(cache.getData(config).ys).toEqual([3]);
    expect(Date.parse(callWS.mock.calls[1][0].start_time)).toBe(start - 1);
  });

  it.each([{ rows: [] }, { rows: [row(start, start + hour, 1)] }])(
    "keeps historical responses cached: %j",
    async ({ rows }) => {
      const config = entity("hour");
      const cache = new Cache();
      const { hass, callWS } = mockHass(rows);
      const range: TimestampRange = [start, start + 2 * hour];
      await cache.fetch(range, config, hass);
      now.mockReturnValue(Date.now() + hour);
      await cache.refreshStatistics(Date.now());
      await cache.fetch(range, config, hass);
      expect(callWS).toHaveBeenCalledTimes(1);
    },
  );

  it("retries a failed refresh without losing the last successful data", async () => {
    const config = entity("day");
    const cache = new Cache();
    const rows = [row(start, start + 24 * hour, 1)];
    const { hass, callWS } = mockHass(rows);
    const range: TimestampRange = [start, start + 24 * hour];
    await cache.fetch(range, config, hass);
    now.mockReturnValue(Date.now() + hour);
    await cache.refreshStatistics(Date.now());
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    callWS.mockRejectedValueOnce(new Error("offline"));
    await expect(cache.fetch(range, config, hass)).rejects.toThrow("offline");
    expect(cache.getData(config).ys).toEqual([1]);
    rows[0] = row(start, start + 24 * hour, 2);
    await cache.fetch(range, config, hass);
    expect(cache.getData(config).ys).toEqual([2]);
    log.mockRestore();
  });

  it("retains batching and shares refreshed aggregates across statistic types", async () => {
    const cache = new Cache();
    const config = entity("day");
    const rows = [{ ...row(start, start + 24 * hour, 1), max: 4 }];
    const { hass, callWS } = mockHass(rows);
    const range: TimestampRange = [start, start + 24 * hour];
    const requests = [
      config,
      { ...config, entity: "sensor.other" },
      { ...config, statistic: "max" as const },
    ].map((entity) => ({ entity, range }));
    await cache.prefetchStatistics(requests, hass);
    now.mockReturnValue(Date.now() + hour);
    await cache.refreshStatistics(Date.now());
    rows[0] = { ...rows[0], mean: 2, max: 5 };
    await cache.prefetchStatistics(requests, hass);
    for (const { entity } of requests)
      await cache.fetch([range[0], Date.now()], entity, hass);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls[1][0].statistic_ids).toEqual([
      "sensor.energy",
      "sensor.other",
    ]);
    expect(cache.getData(config).ys).toEqual([2]);
    expect(cache.getData({ ...config, statistic: "max" }).ys).toEqual([5]);
  });

  it("refreshes the last calendar bucket across midnight until its successor arrives", async () => {
    const config = entity("day");
    const rows = [row(start, start + 24 * hour, 1)];
    const { hass, callWS } = mockHass(rows);
    const cache = new Cache();
    now.mockReturnValue(start + 24 * hour);
    await cache.fetch([start, Date.now()], config, hass);
    now.mockReturnValue(Date.now() + 60000);
    rows[0] = row(start, start + 24 * hour, 2);
    await cache.refreshStatistics(Date.now());
    await cache.fetch([start, Date.now()], config, hass);
    expect(cache.getData(config).ys).toEqual([2]);
    expect(Date.parse(callWS.mock.calls[1][0].start_time)).toBe(start - 1);
  });

  it("recognizes an aligned live endpoint but not historical ranges", () => {
    const now = start + 12 * hour + 30000;
    expect(
      isLiveStatisticsRange([start, start + 12 * hour], "5minute", now),
    ).toBe(true);
    expect(isLiveStatisticsRange([start, start + 11 * hour], "hour", now)).toBe(
      false,
    );
    expect(
      isLiveStatisticsRange([now + hour, now + 2 * hour], "day", now),
    ).toBe(false);
  });

  it.each(["5minute", "hour"] as const)(
    "invalidates only the %s publication group",
    async (publishedPeriod) => {
      const cache = new Cache();
      const periods: StatisticPeriod[] = [
        "5minute",
        "hour",
        "day",
        "week",
        "month",
      ];
      const range: TimestampRange = [start, Date.now()];
      const rows = [row(start + 11 * hour, start + 12 * hour, 1)];
      const { hass, callWS } = mockHass(rows);
      for (const period of periods)
        await cache.fetch(range, entity(period), hass);
      callWS.mockClear();
      now.mockReturnValue(Date.now() + 1000);
      rows[0] = row(start + 11 * hour, start + 12 * hour, 2);
      await cache.refreshStatistics(Date.now(), publishedPeriod);

      for (const period of periods) {
        const refreshed =
          publishedPeriod === "5minute"
            ? period === "5minute"
            : period !== "5minute";
        await cache.fetch(range, entity(period), hass);
        expect(cache.getData(entity(period)).ys).toEqual([refreshed ? 2 : 1]);
      }
      expect(callWS.mock.calls.map(([request]) => request.period)).toEqual(
        publishedPeriod === "5minute" ? ["5minute"] : periods.slice(1),
      );

      callWS.mockClear();
      now.mockReturnValue(Date.now() + 1000);
      await cache.refreshStatistics(Date.now());
      for (const period of periods)
        await cache.fetch(range, entity(period), hass);
      expect(callWS.mock.calls.map(([request]) => request.period)).toEqual(
        periods,
      );
    },
  );
});
