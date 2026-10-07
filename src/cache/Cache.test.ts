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
  afterEach(() => jest.restoreAllMocks());

  it("appends a newer single state without sorting or filtering the history", () => {
    const cache = new Cache();
    cache.add(entity, [state(0), state(10)], [0, 10]);
    const history = cache.histories[key];
    const sort = jest.spyOn(history, "sort");
    const filter = jest.spyOn(history, "filter");
    const next = state(20);

    cache.add(entity, [next], [11, 20]);

    expect(sort).not.toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
    expect(cache.histories[key]).toBe(history);
    expect(history[2]).toBe(next);
    expect(cache.getData(entity).ys).toEqual(["0", "10", "20"]);
    expect(cache.ranges[key]).toEqual([[0, 20]]);
  });

  it("appends attribute values without losing their metadata", () => {
    const cache = new Cache();
    const attribute = { ...entity, attribute: "temperature" };
    const sample = (timestamp: number) => ({
      ...state(timestamp),
      state: {
        ...state(timestamp).state,
        attributes: { temperature: timestamp + 1 },
      },
    });
    cache.add(attribute, [sample(0)], [0, 0]);
    const sort = jest.spyOn(cache.histories[getEntityKey(attribute)], "sort");

    cache.add(attribute, [sample(10)], [1, 10]);

    expect(sort).not.toHaveBeenCalled();
    expect(cache.getData(attribute).ys).toEqual([1, 11]);
    expect(cache.ranges[getEntityKey(attribute)]).toEqual([[0, 10]]);
  });

  it.each([false, true])(
    "appends statistics without dropping values (boundary flag: %s)",
    (fakeBoundary) => {
      const cache = new Cache();
      const statistics = {
        ...entity,
        statistic: "mean" as const,
        period: "hour" as const,
      };
      const sample = (timestamp: number): CachedStatisticsEntity => ({
        x: new Date(timestamp),
        y: null,
        statistics: {
          statistic_id: entity.entity,
          start: new Date(timestamp).toISOString(),
          end: new Date(timestamp + 10).toISOString(),
          last_reset: null,
          mean: timestamp,
          max: timestamp + 1,
          min: timestamp,
          sum: null,
          state: null,
        },
      });
      cache.add(statistics, [sample(0)], [0, 0]);
      const history = cache.histories[getEntityKey(statistics)];
      const sort = jest.spyOn(history, "sort");
      const next = sample(10);
      if (fakeBoundary) next.fake_boundary_datapoint = true;

      cache.add(statistics, [next], [1, 10]);

      expect(sort).not.toHaveBeenCalled();
      expect(history[1]).toBe(next);
      expect(cache.getData(statistics).ys).toEqual([0, 10]);
      expect(cache.getData({ ...statistics, statistic: "max" }).ys).toEqual([
        1, 11,
      ]);
    },
  );

  it("skips a duplicate last timestamp without sorting, filtering or pushing", () => {
    const cache = new Cache();
    const original = state(10);
    cache.add(entity, [state(0), original], [0, 10]);
    const history = cache.histories[key];
    const sort = jest.spyOn(history, "sort");
    const filter = jest.spyOn(history, "filter");
    const push = jest.spyOn(history, "push");
    const duplicate = state(10);
    duplicate.state.state = "replacement";

    cache.add(entity, [duplicate], [10, 20]);

    expect(sort).not.toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(cache.histories[key]).toBe(history);
    expect([...cache.histories[key]]).toEqual([state(0), original]);
    expect(cache.histories[key][1]).toBe(original);
    expect(cache.ranges[key]).toEqual([[0, 20]]);
  });

  it("shares a new state between attribute traces without a second merge", () => {
    const cache = new Cache();
    const temperature = { entity: "climate.test", attribute: "temperature" };
    const humidity = { ...temperature, attribute: "humidity" };
    const sample = (timestamp: number): CachedStateEntity => ({
      ...state(timestamp),
      state: {
        ...state(timestamp).state,
        attributes: { temperature: timestamp + 20, humidity: timestamp + 40 },
      },
    });
    const attributeKey = getEntityKey(temperature);
    expect(getEntityKey(humidity)).toBe(attributeKey);
    cache.add(temperature, [sample(0)], [0, 0]);
    const history = cache.histories[attributeKey];
    const sort = jest.spyOn(history, "sort");
    const filter = jest.spyOn(history, "filter");
    const push = jest.spyOn(history, "push");
    const next = sample(10);

    cache.add(temperature, [next], [1, 10]);
    cache.add(humidity, [next], [10, 20]);

    expect(sort).not.toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
    expect(cache.histories[attributeKey]).toBe(history);
    expect(history).toHaveLength(2);
    expect(history[1]).toBe(next);
    expect(cache.getData(temperature).ys).toEqual([20, 30]);
    expect(cache.getData(humidity).ys).toEqual([40, 50]);
    expect(cache.ranges[attributeKey]).toEqual([[0, 20]]);
  });

  it("still merges a duplicate timestamp earlier than the last sample", () => {
    const cache = new Cache();
    const original = state(10);
    cache.add(entity, [state(0), original, state(20)], [0, 20]);
    const sort = jest.spyOn(cache.histories[key], "sort");

    cache.add(entity, [state(10)], [10, 30]);

    expect(sort).toHaveBeenCalledTimes(1);
    expect(cache.getData(entity).xs.map(Number)).toEqual([0, 10, 20]);
    expect(cache.histories[key][1]).toBe(original);
    expect(cache.ranges[key]).toEqual([[0, 30]]);
  });

  it("uses the normal merge for statistics at the last cached timestamp", () => {
    const cache = new Cache();
    const statistics = {
      ...entity,
      statistic: "mean" as const,
      period: "day" as const,
    };
    const sample = (mean: number): CachedStatisticsEntity => ({
      x: new Date(10),
      y: null,
      statistics: {
        statistic_id: entity.entity,
        start: new Date(10).toISOString(),
        end: new Date(20).toISOString(),
        last_reset: null,
        mean,
        min: mean,
        max: mean,
        sum: null,
        state: null,
      },
    });
    cache.add(statistics, [sample(1)], [0, 10]);
    const sort = jest.spyOn(cache.histories[getEntityKey(statistics)], "sort");
    const push = jest.spyOn(cache.histories[getEntityKey(statistics)], "push");
    const updated = sample(2);

    cache.add(statistics, [updated], [10, 20]);

    expect(sort).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(updated);
    expect(cache.ranges[getEntityKey(statistics)]).toEqual([[0, 20]]);
  });

  it("uses the normal merge for an artificial boundary at the last timestamp", () => {
    const cache = new Cache();
    const original = state(10);
    cache.add(entity, [state(0), original], [0, 10]);
    const sort = jest.spyOn(cache.histories[key], "sort");

    cache.add(
      entity,
      [{ ...state(10), fake_boundary_datapoint: true }],
      [10, 20],
    );

    expect(sort).toHaveBeenCalledTimes(1);
    expect(cache.histories[key]).toEqual([state(0), original]);
    expect(cache.ranges[key]).toEqual([[0, 20]]);
  });

  it("preserves the leading boundary when a real sample has the same timestamp", () => {
    const cache = new Cache();
    const original: CachedStateEntity = {
      ...state(10),
      fake_boundary_datapoint: true,
    };
    cache.add(entity, [original], [10, 20]);
    const history = cache.histories[key];

    cache.add(entity, [state(10)], [20, 30]);

    expect(cache.histories[key]).toBe(history);
    expect(history).toHaveLength(1);
    expect(history[0]).toBe(original);
    expect(cache.ranges[key]).toEqual([[10, 30]]);
  });

  it("sorts an older single sample into the existing history", () => {
    const cache = new Cache();
    cache.add(entity, [state(0), state(20)], [0, 20]);
    const sort = jest.spyOn(cache.histories[key], "sort");

    cache.add(entity, [state(10)], [10, 10]);

    expect(sort).toHaveBeenCalledTimes(1);
    expect(cache.getData(entity).xs.map(Number)).toEqual([0, 10, 20]);
  });

  it("still sorts and deduplicates incoming batches", () => {
    const cache = new Cache();
    cache.add(entity, [state(0)], [0, 0]);
    const first = state(10);

    cache.add(entity, [state(20), first, state(10)], [1, 20]);

    expect(cache.getData(entity).xs.map(Number)).toEqual([0, 10, 20]);
    expect(cache.histories[key][1]).toBe(first);
    expect(cache.ranges[key]).toEqual([[0, 20]]);
  });

  it("discards a newer artificial history boundary but records its coverage", () => {
    const cache = new Cache();
    cache.add(entity, [state(0)], [0, 0]);

    cache.add(
      entity,
      [{ ...state(10), fake_boundary_datapoint: true }],
      [1, 10],
    );

    expect(cache.getData(entity).xs.map(Number)).toEqual([0]);
    expect(cache.ranges[key]).toEqual([[0, 10]]);
  });

  it("keeps the leading artificial boundary when appending a real state", () => {
    const cache = new Cache();
    const boundary: CachedStateEntity = {
      ...state(0),
      fake_boundary_datapoint: true,
    };
    cache.add(entity, [boundary], [1, 5]);

    cache.add(entity, [state(10)], [6, 10]);

    expect(cache.histories[key]).toEqual([boundary, state(10)]);
    expect(cache.histories[key][0]).toBe(boundary);
    expect(cache.ranges[key]).toEqual([[1, 10]]);
  });

  it("records empty response coverage without losing cached samples", () => {
    const cache = new Cache();
    cache.add(entity, [state(0)], [0, 0]);

    cache.add(entity, [], [1, 10]);

    expect(cache.getData(entity).xs.map(Number)).toEqual([0]);
    expect(cache.ranges[key]).toEqual([[0, 10]]);
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
