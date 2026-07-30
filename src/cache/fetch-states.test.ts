import { HomeAssistant } from "custom-card-helpers";
import { fetchStatesBatch } from "./fetch-states";

const start = new Date("2025-01-01T00:00:00.000Z");
const end = new Date("2025-01-02T00:00:00.000Z");

function state(entity_id: string, value: string) {
  return {
    entity_id,
    state: value,
    attributes: {},
    last_changed: start.toISOString(),
    last_updated: start.toISOString(),
    context: { id: "", parent_id: null, user_id: null },
  };
}

describe("fetchStatesBatch", () => {
  it("fetches multiple state entities with one minimal history request", async () => {
    const callApi = jest
      .fn()
      .mockResolvedValue([
        [state("sensor.one", "1")],
        [state("sensor.two", "2")],
      ]);
    const hass = { callApi } as unknown as HomeAssistant;

    const result = await fetchStatesBatch(
      hass,
      [{ entity: "sensor.one" }, { entity: "sensor.two" }],
      [start, end],
    );

    expect(callApi).toHaveBeenCalledTimes(1);
    const uri = callApi.mock.calls[0][1];
    expect(uri).toContain("filter_entity_id=sensor.one,sensor.two");
    expect(uri).toContain("&no_attributes&minimal_response&");
    expect(result["sensor.one"][0].state.state).toBe("1");
    expect(result["sensor.two"][0].state.state).toBe("2");
  });

  it("maps results by entity id instead of response position", async () => {
    const callApi = jest
      .fn()
      .mockResolvedValue([
        [state("sensor.two", "2")],
        [state("sensor.one", "1")],
      ]);
    const hass = { callApi } as unknown as HomeAssistant;

    const result = await fetchStatesBatch(
      hass,
      [
        { entity: "sensor.one" },
        { entity: "sensor.missing" },
        { entity: "sensor.two" },
      ],
      [start, end],
    );

    expect(result["sensor.one"][0].state.state).toBe("1");
    expect(result["sensor.missing"]).toEqual([]);
    expect(result["sensor.two"][0].state.state).toBe("2");
  });

  it("keeps attributes when attribute histories are requested", async () => {
    const callApi = jest.fn().mockResolvedValue([]);
    const hass = { callApi } as unknown as HomeAssistant;

    await fetchStatesBatch(
      hass,
      [
        { entity: "sensor.one", attribute: "temperature" },
        { entity: "sensor.two", attribute: "humidity" },
      ],
      [start, end],
    );

    const uri = callApi.mock.calls[0][1];
    expect(uri).not.toContain("no_attributes");
    expect(uri).not.toContain("minimal_response");
  });
});
