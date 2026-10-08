import { HomeAssistant } from "custom-card-helpers";
import { InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";

const NOW = Date.parse("2025-01-02T12:00:00Z");
const entities: InputConfig["entities"] = [
  { entity: "sensor.power" },
  { entity: "sensor.temperature" },
];
const layout = { xaxis: { tickformat: "%H:%M" } };

async function parse(config: Record<string, unknown>) {
  return new ConfigParser().update({
    yaml: {
      type: "custom:plotly-graph",
      hours_to_show: 1,
      ha_theme: false,
      ...config,
    } as InputConfig,
    hass: {
      locale: { language: "en", first_weekday: "monday" },
      states: {
        "sensor.power": {
          state: "2",
          attributes: { unit_of_measurement: "W" },
        },
        "sensor.temperature": {
          state: "20",
          attributes: { unit_of_measurement: "°C" },
        },
      },
      callWS: async ({ entity_ids }) =>
        Object.fromEntries(
          entity_ids.map((id: string) => [
            id,
            [{ s: "2", lu: NOW / 1000 - 60 }],
          ]),
        ),
    } as unknown as HomeAssistant,
    css_vars: {} as HATheme,
  });
}

describe("automatic right margin", () => {
  beforeEach(() => {
    (global as any).window = { eval };
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).window;
  });

  test.each([{ layout, entities }, { entities, layout }, { entities }])(
    "reserves space for the second axis regardless of YAML order: %j",
    async (config) => {
      const { parsed, errors } = await parse(config);
      expect(errors).toEqual([]);
      expect(parsed.entities).toMatchObject([{ yaxis: "y" }, { yaxis: "y2" }]);
      expect(parsed.layout.margin?.r).toBe(60);
      expect(parsed.layout.yaxis2?.title).toEqual({ text: "°C" });
    },
  );

  test("keeps the smaller margin for a single axis", async () => {
    const { parsed, errors } = await parse({
      layout,
      entities: entities.slice(0, 1),
    });
    expect(errors).toEqual([]);
    expect(parsed.layout.margin?.r).toBe(30);
  });

  test.each([false, true])(
    "uses the evaluated show_value setting: %s",
    async (showValue) => {
      const { parsed, errors } = await parse({
        layout,
        entities: [{ entity: "sensor.power", show_value: `$ex ${showValue}` }],
      });
      expect(errors).toEqual([]);
      expect(parsed.layout.margin?.r).toBe(showValue ? 60 : 30);
    },
  );

  test.each([0, 45, "$ex 42"])(
    "preserves an explicit right margin: %s",
    async (r) => {
      const { parsed, errors } = await parse({
        layout: { ...layout, margin: { r, l: 15 } },
        entities,
      });
      expect(errors).toEqual([]);
      expect(parsed.layout.margin).toMatchObject({
        r: typeof r === "string" ? 42 : r,
        l: 15,
      });
    },
  );

  test("preserves a margin supplied by a preset", async () => {
    (global as any).window.PlotlyGraphCardPresets = {
      compact: { layout: { margin: { r: 12 } } },
    };
    const { parsed, errors } = await parse({
      preset: "compact",
      layout,
      entities,
    });
    expect(errors).toEqual([]);
    expect(parsed.layout.margin?.r).toBe(12);
  });

  test("leaves raw Plotly margins alone", async () => {
    const { parsed, errors } = await parse({
      raw_plotly_config: true,
      layout,
      entities,
    });
    expect(errors).toEqual([]);
    expect(parsed.layout.margin?.r).toBeUndefined();
  });
});
