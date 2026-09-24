jest.mock("../filters/filters", () => ({
  __esModule: true,
  default: {},
}));

import { HomeAssistant } from "custom-card-helpers";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";
import type { EntityConfig } from "../types";

const yValues = (trace: EntityConfig) => ("y" in trace ? trace.y : undefined);

function state(entity_id: string, value: string) {
  const timestamp = "2025-01-01T00:00:00.000Z";
  return {
    entity_id,
    state: value,
    attributes: {
      friendly_name: entity_id,
      unit_of_measurement: "W",
    },
    last_changed: timestamp,
    last_updated: timestamp,
    context: { id: "", parent_id: null, user_id: null },
  };
}

describe("ConfigParser history prefetch", () => {
  beforeAll(() => {
    (global as any).window = {};
  });

  async function parse(entities: any[], fetch_mask: boolean[] = []) {
    const start = Date.parse("2025-01-01T00:00:00.000Z");
    const end = start + 86400000;
    const callWS = jest.fn().mockImplementation((request) => {
      const ids = request.entity_ids || request.statistic_ids;
      return Promise.resolve(
        Object.fromEntries(
          ids.map((entityId) => [
            entityId,
            request.type === "recorder/statistics_during_period"
              ? [{ start, end, mean: 42 }]
              : [{ s: "5", lu: start / 1000, a: { temperature: 21 } }],
          ]),
        ),
      );
    });
    const hass = {
      callWS,
      states: Object.fromEntries(
        ["sensor.one", "sensor.two", "sensor.three", "sensor.stats"].map(
          (id) => [id, state(id, "5")],
        ),
      ),
      locale: { language: "en", first_weekday: "monday" },
    } as unknown as HomeAssistant;
    const parser = new ConfigParser();
    const input = {
      yaml: {
        type: "custom:plotly-graph",
        visible_range: [start, end],
        entities: entities.map((entity) => ({
          extend_to_present: false,
          ...entity,
        })),
        fetch_mask,
      } as any,
      hass,
      css_vars: {} as HATheme,
    };
    const result = await parser.update(input);
    expect(result.errors).toEqual([]);
    return { result, callWS, parser, input, start, end };
  }

  it("skips hidden entities and data-only traces", async () => {
    const { callWS, result } = await parse(
      [
        { entity: "sensor.one" },
        { entity: "sensor.two" },
        { entity: "", x: [1], y: [7] },
        { entity: "sensor.three" },
      ],
      [true, false, true, true],
    );
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].entity_ids).toEqual([
      "sensor.one",
      "sensor.three",
    ]);
    expect(yValues(result.parsed.entities[1])).toEqual([null]);
    expect(yValues(result.parsed.entities[2])).toEqual([7]);
  });

  it("keeps statistics on the recorder API", async () => {
    const { callWS, result } = await parse([
      { entity: "sensor.one" },
      { entity: "sensor.stats", statistic: "mean", period: "5minute" },
      { entity: "sensor.two" },
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: "history/history_during_period",
        entity_ids: ["sensor.one", "sensor.two"],
      }),
    );
    expect(callWS.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        type: "recorder/statistics_during_period",
        statistic_ids: ["sensor.stats"],
        period: "5minute",
      }),
    );
    expect(yValues(result.parsed.entities[1])).toEqual([42]);
  });

  it("separates time offsets while batching identical ranges", async () => {
    const { callWS, start, end } = await parse([
      { entity: "sensor.one", time_offset: "1h" },
      { entity: "sensor.two" },
      { entity: "sensor.three", time_offset: "1h" },
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
    const requests = callWS.mock.calls.map(([request]) => request);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_ids: ["sensor.one", "sensor.three"],
          start_time: new Date(start - 3600000 - 1).toISOString(),
          end_time: new Date(end - 3600000).toISOString(),
        }),
        expect.objectContaining({
          entity_ids: ["sensor.two"],
          start_time: new Date(start - 1).toISOString(),
          end_time: new Date(end).toISOString(),
        }),
      ]),
    );
  });

  it("preserves attributes through the complete parsing path", async () => {
    const { callWS, result } = await parse([
      { entity: "sensor.one" },
      { entity: "sensor.two", attribute: "temperature" },
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(result.parsed.entities.map(yValues)).toEqual([["5"], [21]]);
  });

  it("evaluates dynamic fetch settings in their normal entity order", async () => {
    const { callWS, result } = await parse([
      { entity: "sensor.one" },
      {
        entity: "$fn () => 'sensor.two'",
        attribute: "$fn () => 'temperature'",
      },
    ]);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        entity_ids: ["sensor.two"],
        no_attributes: false,
      }),
    );
    expect(yValues(result.parsed.entities[1])).toEqual([21]);
  });

  it("reuses the history cache on repeated config parsing", async () => {
    const { callWS, parser, input } = await parse([
      { entity: "sensor.one" },
      { entity: "sensor.two" },
    ]);
    const result = await parser.update(input);
    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(result.parsed.entities.map(yValues)).toEqual([["5"], ["5"]]);
  });

  it("loads compatible history entities in one request", async () => {
    const entityIds = [
      "sensor.one",
      "sensor.two",
      "sensor.three",
      "sensor.four",
    ];
    const callWS = jest.fn().mockImplementation(({ entity_ids }) => {
      return Promise.resolve(
        Object.fromEntries(
          entity_ids.map((entityId, index) => [
            entityId,
            [state(entityId, String(index + 1))],
          ]),
        ),
      );
    });
    const states = Object.fromEntries(
      entityIds.map((entityId, index) => [
        entityId,
        state(entityId, String(index + 1)),
      ]),
    );
    const hass = {
      callWS,
      states,
      locale: { language: "en", first_weekday: "monday" },
    } as unknown as HomeAssistant;

    const result = await new ConfigParser().update({
      yaml: {
        type: "custom:plotly-graph",
        hours_to_show: "24h",
        entities: entityIds.map((entity) => ({ entity })),
        fetch_mask: entityIds.map(() => true),
      } as any,
      hass,
      css_vars: {} as HATheme,
    });

    expect(result.errors).toEqual([]);
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0].entity_ids).toEqual(entityIds);
    expect(result.parsed.entities.map(yValues)).toEqual([
      ["1", "1"],
      ["2", "2"],
      ["3", "3"],
      ["4", "4"],
    ]);
  });
});
