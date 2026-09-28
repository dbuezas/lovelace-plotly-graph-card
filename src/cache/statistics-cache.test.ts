import Cache from "./Cache";
import type { EntityIdStatisticsConfig } from "../types";

const range: [number, number] = [
  Date.parse("2025-01-01T00:00:00Z"),
  Date.parse("2025-01-02T00:00:00Z"),
];
const entity = (
  id: string,
  period: "5minute" | "hour" = "hour",
): EntityIdStatisticsConfig => ({ entity: id, statistic: "mean", period });
function mockHass() {
  const callWS = jest.fn(async ({ statistic_ids }) =>
    Object.fromEntries(
      statistic_ids.map((id) => [id, [{ start: range[0], mean: 4, max: 8 }]]),
    ),
  );
  return { callWS, hass: { callWS } as any };
}

describe("Cache.prefetchStatistics", () => {
  it("serializes prefetch and fetch calls without duplicate requests", async () => {
    const cache = new Cache();
    const { hass, callWS } = mockHass();
    const requests = ["sensor.one", "sensor.two"].map((id) => ({
      entity: entity(id),
      range,
    }));
    await Promise.all([
      cache.prefetchStatistics(requests, hass),
      cache.prefetchStatistics(requests, hass),
      cache.fetch(range, entity("sensor.one"), hass),
    ]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(cache.getData(entity("sensor.one")).ys).toEqual([4]);
    expect(
      cache.getData({ ...entity("sensor.one"), statistic: "max" }).ys,
    ).toEqual([8]);
  });

  it("does not share cache entries between different periods", async () => {
    const cache = new Cache();
    const { hass, callWS } = mockHass();
    await cache.prefetchStatistics(
      [
        { entity: entity("sensor.one", "5minute"), range },
        { entity: entity("sensor.one", "hour"), range },
      ],
      hass,
    );
    expect(callWS).toHaveBeenCalledTimes(2);
    await cache.fetch(range, entity("sensor.one", "5minute"), hass);
    await cache.fetch(range, entity("sensor.one", "hour"), hass);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("fetches only uncached ranges", async () => {
    const cache = new Cache();
    const { hass, callWS } = mockHass();
    const middle: [number, number] = [range[0] + 10000, range[1] - 10000];
    cache.add(entity("sensor.one"), [], middle);
    await cache.prefetchStatistics(
      [{ entity: entity("sensor.one"), range }],
      hass,
    );
    expect(
      callWS.mock.calls.map(([request]) => [
        request.start_time,
        request.end_time,
      ]),
    ).toEqual([
      [
        new Date(range[0] - 1).toISOString(),
        new Date(middle[0] - 1).toISOString(),
      ],
      [new Date(middle[1]).toISOString(), new Date(range[1]).toISOString()],
    ]);
  });

  it("keeps successfully fetched groups when a later group fails", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const cache = new Cache();
      const { hass, callWS } = mockHass();
      callWS
        .mockResolvedValueOnce({
          "sensor.one": [{ start: range[0], mean: 4, max: 8 }],
        })
        .mockRejectedValueOnce(new Error("offline"));
      const requests = [
        { entity: entity("sensor.one", "5minute"), range },
        { entity: entity("sensor.two", "hour"), range },
      ];
      await expect(cache.prefetchStatistics(requests, hass)).rejects.toThrow(
        "offline",
      );
      await cache.fetch(range, requests[0].entity, hass);
      expect(callWS).toHaveBeenCalledTimes(2);
      await cache.fetch(range, requests[1].entity, hass);
      expect(callWS).toHaveBeenCalledTimes(3);
      expect(cache.getData(requests[1].entity).ys).toEqual([4]);
    } finally {
      log.mockRestore();
    }
  });

  it("caches empty responses but can clear them explicitly", async () => {
    const cache = new Cache();
    const { hass, callWS } = mockHass();
    callWS.mockResolvedValue({});
    const requests = [{ entity: entity("sensor.one"), range }];
    await cache.prefetchStatistics(requests, hass);
    await cache.fetch(range, requests[0].entity, hass);
    expect(callWS).toHaveBeenCalledTimes(1);
    cache.clearCache();
    await cache.prefetchStatistics(requests, hass);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("does not request data for an empty prefetch list", async () => {
    const { hass, callWS } = mockHass();
    await new Cache().prefetchStatistics([], hass);
    expect(callWS).not.toHaveBeenCalled();
  });
});
