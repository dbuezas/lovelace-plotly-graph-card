import Cache, { getEntityKey } from "./Cache";
import { CachedStateEntity, CachedStatisticsEntity } from "../types";

const entity = { entity: "sensor.test" };
const key = getEntityKey(entity);

function state(timestamp: number): CachedStateEntity {
  return {
    x: new Date(timestamp),
    y: null,
    state: {
      attributes: {},
      state: String(timestamp),
    } as CachedStateEntity["state"],
  };
}

describe("Cache retention", () => {
  it.each([
    [[-20, -10], []],
    [[10, 10], [10]],
    [[11, 19], [10]],
    [[40, 50], [30]],
  ])("selects boundary values for range %p", (range, expected) => {
    const cache = new Cache();
    cache.histories[key] = [0, 10, 20, 30].map(state);
    expect(cache.getData(entity, [range]).xs.map(Number)).toEqual(expected);
  });

  it("does not duplicate a boundary shared by disjoint ranges", () => {
    const cache = new Cache();
    cache.histories[key] = [0, 10, 30].map(state);
    cache.retain({
      [key]: [
        [11, 15],
        [20, 25],
      ],
    });
    expect(cache.getData(entity).xs.map(Number)).toEqual([10]);
  });

  it("does not mutate data already handed to a trace", () => {
    const cache = new Cache();
    cache.add(entity, [0, 10, 20, 30].map(state), [0, 30]);
    const data = cache.getData(entity);
    cache.retain({ [key]: [[20, 30]] });
    expect(data.xs.map(Number)).toEqual([0, 10, 20, 30]);
    expect(cache.getData(entity).xs.map(Number)).toEqual([20, 30]);
  });

  it("retains attribute values using the same boundary selection", () => {
    const cache = new Cache();
    const attribute = { ...entity, attribute: "temperature" };
    const history = [0, 10, 20].map((timestamp) => ({
      ...state(timestamp),
      state: {
        ...state(timestamp).state,
        attributes: { temperature: timestamp + 1 },
      },
    }));
    cache.add(attribute, history, [0, 20]);
    cache.retain({ [getEntityKey(attribute)]: [[15, 20]] });
    expect(cache.getData(attribute).ys).toEqual([11, 21]);
  });

  it("bounds statistics without dropping their values or mixing periods", () => {
    const cache = new Cache();
    const hourly = {
      ...entity,
      statistic: "mean" as const,
      period: "hour" as const,
    };
    const daily = { ...hourly, period: "day" as const };
    const history = [0, 10, 20, 30].map((timestamp) => ({
      x: new Date(timestamp),
      y: null,
      statistics: {
        start: new Date(timestamp).toISOString(),
        mean: timestamp,
        max: timestamp + 1,
      },
    })) as CachedStatisticsEntity[];
    cache.add(hourly, history, [0, 30]);
    cache.add(daily, history, [0, 30]);
    cache.retain({ [getEntityKey(hourly)]: [[15, 25]] });
    expect(cache.getData(hourly).ys).toEqual([10, 20]);
    expect(cache.getData({ ...hourly, statistic: "max" }).ys).toEqual([11, 21]);
    expect(cache.histories[getEntityKey(daily)]).toBeUndefined();
  });

  it("does not mark retained data outside known coverage as fetched", () => {
    const cache = new Cache();
    cache.add(entity, [state(0), state(20)], [10, 20]);
    cache.retain({ [key]: [[0, 30]] });
    expect(cache.ranges[key]).toEqual([[10, 20]]);
  });
  it("returns only the requested data and one leading boundary value", () => {
    const cache = new Cache();
    cache.histories[key] = [0, 10, 20, 30].map(state);

    const data = cache.getData(entity, [[15, 25]]);

    expect(data.xs.map(Number)).toEqual([10, 20]);
    expect(data.ys).toEqual(["10", "20"]);
  });

  it("retains disjoint ranges for traces sharing a sensor", () => {
    const cache = new Cache();
    cache.histories[key] = [0, 10, 20, 30, 100, 110, 120].map(state);
    cache.ranges[key] = [[0, 120]];

    cache.retain({
      [key]: [
        [15, 25],
        [105, 115],
      ],
    });

    expect(cache.histories[key].map(({ x }) => +x)).toEqual([10, 20, 100, 110]);
    expect(cache.ranges[key]).toEqual([
      [15, 25],
      [105, 115],
    ]);
  });

  it("removes cache entries that are no longer configured", () => {
    const cache = new Cache();
    cache.histories[key] = [state(0)];
    cache.ranges[key] = [[0, 0]];

    cache.retain({});

    expect(cache.histories).toEqual({});
    expect(cache.ranges).toEqual({});
  });

  it("stays bounded over repeated rolling-window updates", () => {
    const cache = new Cache();

    for (let timestamp = 0; timestamp < 1_000; timestamp++) {
      cache.add(entity, [state(timestamp)], [timestamp, timestamp]);
      cache.retain({
        [key]: [[Math.max(0, timestamp - 59), Number.POSITIVE_INFINITY]],
      });
    }

    expect(cache.histories[key]).toHaveLength(60);
    expect(cache.histories[key][0].x).toEqual(new Date(940));
    expect(cache.histories[key][59].x).toEqual(new Date(999));
    expect(cache.ranges[key]).toEqual([[940, 999]]);
  });
});
