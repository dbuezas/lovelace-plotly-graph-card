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

describe("Cache merging", () => {
  afterEach(() => vi.restoreAllMocks());

  const boundary = (timestamp: number): CachedStateEntity => ({
    ...state(timestamp),
    fake_boundary_datapoint: true,
  });

  it("appends a newer state without a full merge", () => {
    const cache = new Cache();
    cache.add(entity, [state(0), state(10)], [0, 10]);
    const sort = vi.spyOn(cache.histories[key], "sort");

    cache.add(entity, [state(20)], [11, 20]);

    expect(sort).not.toHaveBeenCalled();
    expect(cache.getData(entity).xs.map(Number)).toEqual([0, 10, 20]);
    expect(cache.ranges[key]).toEqual([[0, 20]]);
  });

  it("adds a state shared by attribute traces once", () => {
    const cache = new Cache();
    const temperature = { entity: "climate.test", attribute: "temperature" };
    const humidity = { ...temperature, attribute: "humidity" };
    const attributeKey = getEntityKey(temperature);
    cache.add(temperature, [state(0)], [0, 0]);
    const sort = vi.spyOn(cache.histories[attributeKey], "sort");

    cache.add(temperature, [state(10)], [1, 10]);
    cache.add(humidity, [state(10)], [10, 20]);

    expect(sort).not.toHaveBeenCalled();
    expect(cache.getData(humidity).xs.map(Number)).toEqual([0, 10]);
    expect(cache.ranges[attributeKey]).toEqual([[0, 20]]);
  });

  it.each([
    ["an older state", [state(0), state(20)], [state(10)], [0, 10, 20]],
    [
      "an earlier duplicate",
      [state(0), state(10), state(20)],
      [state(10)],
      [0, 10, 20],
    ],
    ["a batch", [state(0)], [state(20), state(10), state(10)], [0, 10, 20]],
    ["a newer boundary", [state(0)], [boundary(10)], [0]],
    ["a state after the leading boundary", [boundary(0)], [state(10)], [0, 10]],
  ])("merges %s like before", (_, cached, added, xs) => {
    const cache = new Cache();
    cache.add(entity, cached, [0, 20]);
    cache.add(entity, added, [0, 20]);
    expect(cache.getData(entity).xs.map(Number)).toEqual(xs);
  });

  it("replaces statistics refetched at the same timestamp", () => {
    const cache = new Cache();
    const statistics = {
      ...entity,
      statistic: "mean" as const,
      period: "day" as const,
    };
    const sample = (
      timestamp: number,
      mean: number,
    ): CachedStatisticsEntity => ({
      x: new Date(timestamp),
      y: null,
      statistics: { mean } as CachedStatisticsEntity["statistics"],
    });

    cache.add(statistics, [sample(10, 1)], [0, 10]);
    cache.add(statistics, [sample(10, 2)], [10, 20]);
    cache.add(statistics, [sample(20, 3)], [20, 30]);

    expect(cache.getData(statistics).ys).toEqual([2, 3]);
  });

  it("merges large histories without exceeding argument limits", () => {
    const cache = new Cache();
    const first = state(0);
    cache.add(entity, [first], [0, 0]);
    const history = Array.from({ length: 200_000 }, (_, index) =>
      state(index + 1),
    );

    cache.add(entity, history, [0, 200_000]);

    const merged = cache.histories[key];
    expect(merged).toHaveLength(history.length + 1);
    expect(merged[0]).toBe(first);
    expect(
      merged.slice(1).every((sample, index) => sample === history[index]),
    ).toBe(true);
    expect(cache.ranges[key]).toEqual([[0, 200_000]]);
  });
});

describe("Cache retention", () => {
  it("reuses unchanged history while still trimming cached coverage", () => {
    const cache = new Cache();
    cache.add(entity, [0, 10, 20].map(state), [-100, 100]);
    const history = cache.histories[key];

    cache.retain({ [key]: [[1, 20]] });

    expect(cache.histories[key]).toBe(history);
    expect(cache.ranges[key]).toEqual([[1, 20]]);
    cache.retain({ [key]: [[1, 20]] });
    expect(cache.histories[key]).toBe(history);
  });

  it("does not reuse history when disjoint ranges leave a gap", () => {
    const cache = new Cache();
    cache.add(entity, [0, 10, 20, 30, 40].map(state), [0, 40]);
    const history = cache.histories[key];

    cache.retain({
      [key]: [
        [0, 10],
        [30, 40],
      ],
    });

    expect(cache.histories[key]).not.toBe(history);
    expect(cache.getData(entity).xs.map(Number)).toEqual([0, 10, 30, 40]);
  });

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
