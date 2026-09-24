import fetchStatistics from "./fetch-statistics";
import type { EntityIdStatisticsConfig } from "../types";

const range: [Date, Date] = [
  new Date("2025-01-01T00:00:00Z"),
  new Date("2025-01-02T00:00:00Z"),
];
const entity = (id: string): EntityIdStatisticsConfig => ({
  entity: id,
  statistic: "mean",
  period: "hour",
});

describe("fetchStatistics", () => {
  it("deduplicates ids and maps reordered or missing responses by id", async () => {
    const point = {
      start: +range[0],
      end: +range[0] + 3600000,
      mean: 7,
      max: 9,
    };
    const callWS = jest
      .fn()
      .mockResolvedValue({ "sensor.two": [point], "sensor.extra": [point] });
    const result = await fetchStatistics(
      { callWS } as any,
      [entity("sensor.one"), entity("sensor.two"), entity("sensor.one")],
      range,
    );
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS).toHaveBeenCalledWith({
      type: "recorder/statistics_during_period",
      statistic_ids: ["sensor.one", "sensor.two"],
      period: "hour",
      start_time: range[0].toISOString(),
      end_time: range[1].toISOString(),
    });
    expect(Object.keys(result)).toEqual(["sensor.one", "sensor.two"]);
    expect(result["sensor.one"]).toEqual([]);
    expect(result["sensor.two"][0]).toEqual({
      statistics: point,
      x: range[0],
      y: null,
    });
  });

  it("handles an empty response", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    expect(
      await fetchStatistics({ callWS } as any, [entity("sensor.one")], range),
    ).toEqual({ "sensor.one": [] });
  });

  it("preserves null statistics and ISO timestamps", async () => {
    const point = { start: range[0].toISOString(), mean: null, sum: 5 };
    const callWS = jest.fn().mockResolvedValue({ "sensor.one": [point] });
    const result = await fetchStatistics(
      { callWS } as any,
      [entity("sensor.one")],
      range,
    );
    expect(result["sensor.one"][0].statistics).toBe(point);
    expect(result["sensor.one"][0].x).toEqual(range[0]);
  });

  it("identifies the affected ids when a request fails", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const callWS = jest.fn().mockRejectedValue({ message: "offline" });
      await expect(
        fetchStatistics(
          { callWS } as any,
          [entity("sensor.one"), entity("sensor.two")],
          range,
        ),
      ).rejects.toThrow(
        'Error fetching statistics of sensor.one, sensor.two: "offline"',
      );
    } finally {
      log.mockRestore();
    }
  });
});
