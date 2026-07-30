jest.mock("../filters/filters", () => ({
  __esModule: true,
  default: {},
}));

import { HomeAssistant } from "custom-card-helpers";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";

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
    expect(result.parsed.entities.map(({ y }) => y)).toEqual([
      ["1", "1"],
      ["2", "2"],
      ["3", "3"],
      ["4", "4"],
    ]);
  });
});
