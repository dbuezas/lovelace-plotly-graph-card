import { HomeAssistant } from "custom-card-helpers";
import fetchStates, { fetchStatesBatch } from "./fetch-states";

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
  it("does not request history for an empty entity list", async () => {
    const callWS = jest.fn();
    expect(await fetchStatesBatch({ callWS } as any, [], [start, end])).toEqual(
      {},
    );
    expect(callWS).not.toHaveBeenCalled();
  });

  it("deduplicates entity ids and retains attributes for mixed requests", async () => {
    const callWS = jest.fn().mockResolvedValue({});
    await fetchStatesBatch(
      { callWS } as any,
      [
        { entity: "sensor.one" },
        { entity: "sensor.one", attribute: "temperature" },
      ],
      [start, end],
    );
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_ids: ["sensor.one"],
        no_attributes: false,
        minimal_response: false,
      }),
    );
  });

  it.each([{}, null, undefined])(
    "handles an empty response: %p",
    async (response) => {
      const callWS = jest.fn().mockResolvedValue(response);
      expect(
        await fetchStatesBatch(
          { callWS } as any,
          [{ entity: "sensor.one" }],
          [start, end],
        ),
      ).toEqual({ "sensor.one": [] });
    },
  );

  it("uses the same WebSocket path for a single-entity fetch", async () => {
    const callWS = jest.fn().mockResolvedValue({
      "sensor.one": [{ s: "unknown", lu: +start / 1000 + 0.125 }],
    });
    const callApi = jest.fn();
    const result = await fetchStates(
      { callWS, callApi } as any,
      { entity: "sensor.one" },
      [start, end],
    );
    expect(callApi).not.toHaveBeenCalled();
    expect(result[0].x.getTime()).toBe(+start + 125);
    expect(result[0].state.last_changed).toBe(result[0].state.last_updated);
    expect(result[0].state.attributes).toEqual({});
    expect(result[0].state.state).toBe("unknown");
  });

  it("reports a rejected WebSocket request without falling back to REST", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const callWS = jest
        .fn()
        .mockRejectedValue({ message: "Connection lost" });
      const callApi = jest.fn();
      await expect(
        fetchStatesBatch(
          { callWS, callApi } as any,
          [{ entity: "sensor.one" }, { entity: "sensor.two" }],
          [start, end],
        ),
      ).rejects.toThrow(
        'Error fetching states of sensor.one, sensor.two: "Connection lost"',
      );
      expect(callApi).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("fetches multiple state entities with one minimal websocket request", async () => {
    const callWS = jest.fn().mockResolvedValue({
      "sensor.one": [{ s: "1", lu: start.getTime() / 1000 }],
      "sensor.two": [{ s: "2", lu: start.getTime() / 1000 }],
    });
    const hass = { callWS } as unknown as HomeAssistant;

    const result = await fetchStatesBatch(
      hass,
      [{ entity: "sensor.one" }, { entity: "sensor.two" }],
      [start, end],
    );

    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS).toHaveBeenCalledWith({
      type: "history/history_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: ["sensor.one", "sensor.two"],
      include_start_time_state: true,
      significant_changes_only: false,
      minimal_response: true,
      no_attributes: true,
    });
    expect(result["sensor.one"][0].state.state).toBe("1");
    expect(result["sensor.two"][0].state.state).toBe("2");
  });

  it("maps websocket results by entity id", async () => {
    const callWS = jest.fn().mockResolvedValue({
      "sensor.two": [state("sensor.two", "2")],
      "sensor.one": [state("sensor.one", "1")],
    });
    const hass = { callWS } as unknown as HomeAssistant;

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
    const timestamp = start.getTime() / 1000;
    const callWS = jest.fn().mockResolvedValue({
      "sensor.one": [
        {
          s: "1",
          a: { temperature: 21 },
          lc: timestamp - 10,
          lu: timestamp,
        },
      ],
      "sensor.two": [],
    });
    const hass = { callWS } as unknown as HomeAssistant;

    const result = await fetchStatesBatch(
      hass,
      [
        { entity: "sensor.one", attribute: "temperature" },
        { entity: "sensor.two", attribute: "humidity" },
      ],
      [start, end],
    );

    const request = callWS.mock.calls[0][0];
    expect(request.no_attributes).toBe(false);
    expect(request.minimal_response).toBe(false);
    expect(result["sensor.one"][0].state.attributes.temperature).toBe(21);
    expect(result["sensor.one"][0].state.last_updated).toBe(
      start.toISOString(),
    );
    expect(result["sensor.one"][0].state.last_changed).toBe(
      new Date((timestamp - 10) * 1000).toISOString(),
    );
  });

  it("accepts expanded history states for compatibility", async () => {
    const expanded = state("sensor.one", "1");
    const callWS = jest.fn().mockResolvedValue({
      "sensor.one": [expanded],
    });
    const hass = { callWS } as unknown as HomeAssistant;

    const result = await fetchStatesBatch(
      hass,
      [{ entity: "sensor.one" }],
      [start, end],
    );

    expect(result["sensor.one"][0].state).toBe(expanded);
  });
});
