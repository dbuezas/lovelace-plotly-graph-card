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
