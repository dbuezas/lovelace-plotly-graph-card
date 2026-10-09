import type { MockInstance } from "vitest";
import type { HomeAssistant } from "custom-card-helpers";
import type { StatisticPeriod } from "../recorder-types";
import type { EntityIdStatisticsConfig, TimestampRange } from "../types";
import Cache from "./Cache";

const minute = 60000;
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
  const callWS = vi.fn(async ({ statistic_ids }) =>
    Object.fromEntries(statistic_ids.map((id: string) => [id, rows])),
  );
  const startTimes = () =>
    callWS.mock.calls.map(([request]) => Date.parse(request.start_time));
  return { callWS, startTimes, hass: { callWS } as unknown as HomeAssistant };
}

describe("refreshing live statistics in the cache", () => {
  let now: MockInstance;
  beforeEach(() => {
    now = vi.spyOn(Date, "now").mockReturnValue(start + 12 * hour);
  });
  afterEach(() => vi.restoreAllMocks());
  const advance = (ms: number) => now.mockReturnValue(Date.now() + ms);

  it.each(["single", "batched"])(
    "refetches from the end of the last complete bucket (%s fetch)",
    async (path) => {
      now.mockReturnValue(start + 12 * hour + 7 * minute);
      const cache = new Cache();
      const config = entity("5minute");
      const bucket = start + 12 * hour;
      const rows = [row(bucket, bucket + 5 * minute, 1)];
      const { hass, startTimes } = mockHass(rows);
      const fetch = () =>
        path === "single"
          ? cache.fetch([start, Date.now()], config, hass)
          : cache.prefetchStatistics(
              [{ entity: config, range: [start, Date.now()] }],
              hass,
            );
      await fetch();
      rows.push(row(bucket + 5 * minute, bucket + 10 * minute, 2));
      advance(5 * minute);
      await cache.refreshStatistics(Date.now());
      await fetch();
      expect(cache.getData(config).ys).toEqual([1, 2]);
      await fetch();
      expect(startTimes()).toEqual([start - 1, bucket + 5 * minute - 1]);
    },
  );

  // A 23 hour day (DST in Europe/Zurich): only HA knows the boundaries.
  const dayStart = Date.parse("2026-03-28T23:00:00Z");
  const dayEnd = Date.parse("2026-03-29T22:00:00Z");
  // Just after midnight the day may still lack its final hourly row.
  it.each([
    ["during the day", dayStart + 12 * hour],
    ["just after it ends", dayEnd + minute],
  ])(
    "refetches a partial calendar bucket from HA's start, keeping HA's end (%s)",
    async (_, fetchedAt) => {
      now.mockReturnValue(fetchedAt);
      const rows = [row(dayStart, dayEnd, 1)];
      const { hass, startTimes } = mockHass(rows);
      const config = entity("day");
      const cache = new Cache();
      await cache.fetch([dayStart, Date.now()], config, hass);
      rows[0] = row(dayStart, dayEnd, 2);
      advance(hour);
      await cache.refreshStatistics(Date.now());
      await cache.fetch([dayStart, Date.now()], config, hass);
      expect(cache.getData(config).ys).toEqual([2]);
      expect(cache.getData(config).statistics[0].end).toBe(
        new Date(dayEnd).toISOString(),
      );
      expect(startTimes()).toEqual([dayStart - 1, dayStart - 1]);
    },
  );

  it("refetches an empty live response from the window start", async () => {
    const config = entity("hour");
    const cache = new Cache();
    const rows: ReturnType<typeof row>[] = [];
    const { hass, startTimes } = mockHass(rows);
    await cache.fetch([start, Date.now()], config, hass);
    rows.push(row(start + 10 * hour, start + 11 * hour, 3));
    advance(hour);
    await cache.refreshStatistics(Date.now());
    await cache.fetch([start, Date.now()], config, hass);
    expect(cache.getData(config).ys).toEqual([3]);
    expect(startTimes()).toEqual([start - 1, start - 1]);
  });

  it("keeps historical ranges cached", async () => {
    const config = entity("hour");
    const cache = new Cache();
    const { hass, callWS } = mockHass([row(start, start + hour, 1)]);
    const range: TimestampRange = [start, start + 2 * hour];
    await cache.fetch(range, config, hass);
    advance(hour);
    await cache.refreshStatistics(Date.now());
    await cache.fetch(range, config, hass);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("keeps the last data when a refetch fails, and retries", async () => {
    const config = entity("day");
    const cache = new Cache();
    const rows = [row(start, start + 24 * hour, 1)];
    const { hass, callWS } = mockHass(rows);
    const range: TimestampRange = [start, start + 24 * hour];
    await cache.fetch(range, config, hass);
    advance(hour);
    await cache.refreshStatistics(Date.now());
    vi.spyOn(console, "error").mockImplementation(() => {});
    callWS.mockRejectedValueOnce(new Error("offline"));
    await expect(cache.fetch(range, config, hass)).rejects.toThrow("offline");
    expect(cache.getData(config).ys).toEqual([1]);
    rows[0] = row(start, start + 24 * hour, 2);
    await cache.fetch(range, config, hass);
    expect(cache.getData(config).ys).toEqual([2]);
  });

  it.each(["5minute", "hour"] as const)(
    "a %s publication invalidates only the periods built from it",
    async (published) => {
      const cache = new Cache();
      const periods: StatisticPeriod[] = [
        "5minute",
        "hour",
        "day",
        "week",
        "month",
      ];
      const range: TimestampRange = [start, Date.now()];
      const { hass, callWS } = mockHass([
        row(start + 11 * hour, start + 12 * hour, 1),
      ]);
      const fetchAll = async () => {
        callWS.mockClear();
        for (const period of periods)
          await cache.fetch(range, entity(period), hass);
        return callWS.mock.calls.map(([request]) => request.period);
      };
      await fetchAll();
      advance(1000);
      await cache.refreshStatistics(Date.now(), published);
      expect(await fetchAll()).toEqual(
        published === "5minute" ? ["5minute"] : periods.slice(1),
      );
      advance(1000);
      await cache.refreshStatistics(Date.now());
      expect(await fetchAll()).toEqual(periods);
    },
  );
});
