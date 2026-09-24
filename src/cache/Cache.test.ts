import { HomeAssistant } from "custom-card-helpers";
import Cache, { HistoryFetchRequest } from "./Cache";

const range: [number, number] = [
  Date.parse("2025-01-01T00:00:00.000Z"),
  Date.parse("2025-01-02T00:00:00.000Z"),
];

function createHass() {
  const callWS = jest.fn().mockImplementation(({ entity_ids }) => {
    return Promise.resolve(
      Object.fromEntries(
        entity_ids.map((entity_id, index) => [
          entity_id,
          [
            {
              entity_id,
              state: String(index + 1),
              attributes: { value: index + 10 },
              last_changed: new Date(range[0]).toISOString(),
              last_updated: new Date(range[0]).toISOString(),
              context: { id: "", parent_id: null, user_id: null },
            },
          ],
        ]),
      ),
    );
  });
  return {
    hass: { callWS } as unknown as HomeAssistant,
    callWS,
  };
}

describe("Cache.prefetchHistory", () => {
  it("reuses prefetched data through the normal fetch path", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    const entity = { entity: "sensor.one" };
    await cache.prefetchHistory([{ entity, range }], hass);
    expect((await cache.fetch(range, entity, hass)).ys).toEqual(["1"]);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent prefetch and fetch calls without duplicate requests", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    const entity = { entity: "sensor.one" };
    await Promise.all([
      cache.prefetchHistory([{ entity, range }], hass),
      cache.prefetchHistory([{ entity, range }], hass),
      cache.fetch(range, entity, hass),
    ]);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("only fetches missing cache intervals", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    const entity = { entity: "sensor.one" };
    const middle: [number, number] = [range[0] + 10000, range[1] - 10000];
    cache.add(entity, [], middle);
    await cache.prefetchHistory([{ entity, range }], hass);
    expect(callWS).toHaveBeenCalledTimes(2);
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
    expect(cache.ranges[entity.entity]).toEqual([range]);
  });

  it("shares full attribute histories without mixing state-only data", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    await cache.prefetchHistory(
      [
        { entity: { entity: "sensor.one", attribute: "value" }, range },
        { entity: { entity: "sensor.one", attribute: "missing" }, range },
        { entity: { entity: "sensor.one" }, range },
      ],
      hass,
    );
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(
      cache.getData({ entity: "sensor.one", attribute: "value" }).ys,
    ).toEqual([10]);
    expect(
      cache.getData({ entity: "sensor.one", attribute: "missing" }).ys,
    ).toEqual([undefined]);
    expect(cache.getData({ entity: "sensor.one" }).ys).toEqual(["1"]);
  });

  it("marks empty responses as cached and can explicitly clear them", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    callWS.mockResolvedValue({});
    const requests = [{ entity: { entity: "sensor.one" }, range }];
    await cache.prefetchHistory(requests, hass);
    await cache.prefetchHistory(requests, hass);
    expect(callWS).toHaveBeenCalledTimes(1);
    cache.clearCache();
    await cache.prefetchHistory(requests, hass);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed batch without marking its range cached", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const cache = new Cache();
      const { hass, callWS } = createHass();
      callWS.mockRejectedValueOnce(new Error("Disconnected"));
      const requests = [{ entity: { entity: "sensor.one" }, range }];
      await expect(cache.prefetchHistory(requests, hass)).rejects.toThrow(
        "Disconnected",
      );
      expect(cache.ranges["sensor.one"]).toEqual([]);
      await cache.prefetchHistory(requests, hass);
      expect(callWS).toHaveBeenCalledTimes(2);
      expect(cache.getData({ entity: "sensor.one" }).ys).toEqual(["1"]);
    } finally {
      log.mockRestore();
    }
  });

  it("preserves unavailable states as gaps", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    callWS.mockResolvedValue({
      "sensor.one": [
        { s: "1", lu: range[0] / 1000 },
        { s: "unavailable", lu: range[0] / 1000 + 1 },
        { s: "unknown", lu: range[0] / 1000 + 2 },
        { s: "2", lu: range[0] / 1000 + 3 },
      ],
    });
    await cache.prefetchHistory(
      [{ entity: { entity: "sensor.one" }, range }],
      hass,
    );
    expect(cache.getData({ entity: "sensor.one" }).ys).toEqual([
      "1",
      null,
      null,
      "2",
    ]);
  });

  it("removes intermediate synthetic boundary points when extending history", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    const end = range[0] + 10000;
    callWS
      .mockResolvedValueOnce({
        "sensor.one": [
          { s: "1", lu: (range[0] - 1) / 1000 },
          { s: "2", lu: (range[0] + 1000) / 1000 },
        ],
      })
      .mockResolvedValueOnce({
        "sensor.one": [
          { s: "2", lu: end / 1000 },
          { s: "3", lu: (end + 1000) / 1000 },
        ],
      });
    const entity = { entity: "sensor.one" };
    await cache.prefetchHistory([{ entity, range: [range[0], end] }], hass);
    await cache.prefetchHistory(
      [{ entity, range: [range[0], end + 10000] }],
      hass,
    );
    expect(cache.getData(entity).ys).toEqual(["1", "2", "3"]);
    expect(cache.getData(entity).xs.map(Number)).toEqual([
      range[0] - 1,
      range[0] + 1000,
      end + 1000,
    ]);
  });
  it("batches state entities with the same range", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    const requests: HistoryFetchRequest[] = [
      { entity: { entity: "sensor.one" }, range },
      { entity: { entity: "sensor.two" }, range },
      { entity: { entity: "sensor.three" }, range },
      { entity: { entity: "sensor.four" }, range },
    ];

    await cache.prefetchHistory(requests, hass);

    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].entity_ids).toEqual([
      "sensor.one",
      "sensor.two",
      "sensor.three",
      "sensor.four",
    ]);
    expect(cache.getData({ entity: "sensor.three" }).ys).toEqual(["3"]);
  });

  it("separates different ranges and attribute requests", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();

    await cache.prefetchHistory(
      [
        { entity: { entity: "sensor.state" }, range },
        {
          entity: { entity: "sensor.offset" },
          range: [range[0] - 1000, range[1] - 1000],
        },
        {
          entity: { entity: "sensor.attribute", attribute: "value" },
          range,
        },
      ],
      hass,
    );

    expect(callWS).toHaveBeenCalledTimes(3);
    const attributeRequest = callWS.mock.calls
      .map((call) => call[0])
      .find(({ entity_ids }) => entity_ids.includes("sensor.attribute"));
    expect(attributeRequest.minimal_response).toBe(false);
    expect(attributeRequest.no_attributes).toBe(false);
  });

  it("does not refetch ranges already cached by a batch", async () => {
    const cache = new Cache();
    const { hass, callWS } = createHass();
    const requests: HistoryFetchRequest[] = [
      { entity: { entity: "sensor.one" }, range },
      { entity: { entity: "sensor.two" }, range },
    ];

    await cache.prefetchHistory(requests, hass);
    await cache.prefetchHistory(requests, hass);

    expect(callWS).toHaveBeenCalledTimes(1);
  });
});
