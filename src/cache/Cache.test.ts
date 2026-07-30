import Cache, { getEntityKey } from "./Cache";
import { CachedStateEntity } from "../types";

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
