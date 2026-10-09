import { HomeAssistant } from "custom-card-helpers";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";
import { InputConfig } from "../types";

const NOW = Date.parse("2026-10-03T12:00:00Z");

async function parse(overrides: Partial<InputConfig> = {}) {
  return new ConfigParser().update({
    yaml: {
      type: "custom:plotly-graph",
      color_scheme: "dark2",
      entities: [{ entity: "sensor.energy", type: "bar" }],
      ...overrides,
    },
    hass: {
      locale: { language: "en", first_weekday: "monday" },
      states: {},
      callWS: async ({ entity_ids }) =>
        Object.fromEntries(
          entity_ids.map((id: string) => [
            id,
            [
              { s: "1", lu: NOW / 1000 - 120 },
              { s: "2", lu: NOW / 1000 - 60 },
            ],
          ]),
        ),
    } as unknown as HomeAssistant,
    css_vars: {} as HATheme,
  });
}

describe("bar color schemes", () => {
  beforeEach(() => {
    Object.assign(global, { window: { eval } });
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(global, "window");
  });

  it.each([
    ["dark2", "#1b9e77"],
    [0, "#7fc97f"],
    [1, "#1f77b4"],
    [["red", "green"], "red"],
  ] satisfies [InputConfig["color_scheme"], string][])(
    "applies palette %j to bar fills",
    async (color_scheme, expected) => {
      const { parsed, errors } = await parse({ color_scheme });
      expect(errors).toEqual([]);
      expect(parsed.entities[0]).toMatchObject({ marker: { color: expected } });
    },
  );

  it("keeps bar and scatter colors aligned by entity index, including internal entities", async () => {
    const { parsed, errors } = await parse({
      color_scheme: ["red", "green", "blue"],
      entities: [
        { entity: "sensor.internal", internal: true },
        { entity: "sensor.line", type: "scatter" },
        { entity: "sensor.bar", type: "bar" },
        { entity: "sensor.wrapped", type: "bar" },
      ],
    });
    expect(errors).toEqual([]);
    expect(parsed.entities).toMatchObject([
      { line: { color: "green" } },
      { marker: { color: "blue" } },
      { marker: { color: "red" } },
    ]);
  });

  it.each(["purple", ["purple", "orange"], [1, 2]])(
    "preserves an explicit marker color: %j",
    async (color) => {
      const { parsed, errors } = await parse({
        entities: [{ entity: "sensor.energy", type: "bar", marker: { color } }],
      });
      expect(errors).toEqual([]);
      expect(parsed.entities[0]).toMatchObject({ marker: { color } });
    },
  );

  it("preserves marker styles and colors from entity defaults", async () => {
    const { parsed, errors } = await parse({
      defaults: { entity: { marker: { color: "purple", line: { width: 2 } } } },
    });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      marker: { color: "purple", line: { width: 2 } },
    });
  });

  it("adds the default color without replacing other marker settings", async () => {
    const { parsed, errors } = await parse({
      entities: [
        {
          entity: "sensor.energy",
          type: "bar",
          marker: { line: { width: 2 }, opacity: 0.5 },
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      marker: { color: "#1b9e77", line: { width: 2 }, opacity: 0.5 },
    });
  });

  it("does not change marker defaults on other trace types", async () => {
    const { parsed, errors } = await parse({
      entities: [{ entity: "sensor.energy", type: "scatter", mode: "markers" }],
    });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).not.toHaveProperty("marker");
    expect(parsed.entities[0]).toMatchObject({ line: { color: "#1b9e77" } });
  });

  it("leaves raw Plotly colors untouched", async () => {
    const { parsed, errors } = await parse({
      raw_plotly_config: true,
      entities: [{ entity: "", type: "bar", x: [1, 2], y: [1, 2] }],
    });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).not.toHaveProperty("marker");
  });

  it.each([
    { colorway: ["purple", "orange"] },
    { template: { layout: { colorway: ["purple", "orange"] } } },
  ])("leaves explicit Plotly palettes in control: %j", async (layout) => {
    const { parsed, errors } = await parse({ layout });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).not.toHaveProperty("marker");
  });

  it("supports a bar type inherited from entity defaults", async () => {
    const { parsed, errors } = await parse({
      defaults: { entity: { type: "bar" } },
      entities: [{ entity: "sensor.energy" }],
    });
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      type: "bar",
      marker: { color: "#1b9e77" },
    });
  });

  it("uses evaluated trace types and explicit marker colors", async () => {
    const { parsed, errors } = await parse({
      entities: [
        { entity: "sensor.energy", type: "$ex 'bar'" },
        {
          entity: "sensor.energy",
          type: "bar",
          marker: "$fn () => ({ color: 'purple' })",
        },
      ],
    } as unknown as Partial<InputConfig>);
    expect(errors).toEqual([]);
    expect(parsed.entities).toMatchObject([
      { type: "bar", marker: { color: "#1b9e77" } },
      { type: "bar", marker: { color: "purple" } },
    ]);
  });

  it("uses an explicit line color as the bar fallback without mutating the configuration", async () => {
    const bar = {
      entity: "sensor.energy",
      type: "bar" as const,
      line: { color: "purple" },
      marker: { opacity: 0.5 },
    };
    const config: Partial<InputConfig> = { entities: [bar] };
    const { parsed, errors } = await parse(config);
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      marker: { color: "purple", opacity: 0.5 },
    });
    expect(config.entities?.[0]).toMatchObject({ marker: { opacity: 0.5 } });
    expect(config.entities?.[0]).not.toHaveProperty("marker.color");
  });
});
