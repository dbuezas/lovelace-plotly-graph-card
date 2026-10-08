import { HomeAssistant } from "custom-card-helpers";
import { EntityConfig, InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { HATheme, readThemeColors } from "./themed-layout";

const NOW = Date.parse("2025-01-02T12:00:00.000Z");

const cssVars: HATheme = {
  ...readThemeColors({ getPropertyValue: () => "" }),
  "card-background-color": "#fff",
  "primary-background-color": "#fff",
  "primary-color": "#000",
  "primary-text-color": "#000",
  "secondary-text-color": "#000",
  "font-family": "Roboto, Noto, sans-serif",
  "font-size": "12px",
  "font-weight": "400",
};

const STATE = {
  entity_id: "sensor.thermostat_temperature",
  state: "21",
  attributes: { friendly_name: "Living room Thermostat Temperature" },
};

/**
 * `formatEntityName` as 2026.4 behaves: a string (including the empty one) is
 * returned verbatim, undefined composes the entity's own name, and a list of
 * parts is resolved from the registry.
 */
const formatEntityName = (_stateObj: unknown, name: unknown) => {
  if (typeof name === "string") return name;
  if (name === undefined) return "Living room Thermostat Temperature";
  const parts = Array.isArray(name) ? name : [name];
  return parts
    .map((p: any) => (p.type === "text" ? p.text : `<${p.type}>`))
    .join(" ");
};

function createHass(overrides: Partial<HomeAssistant> = {}): HomeAssistant {
  return {
    callWS: jest.fn(),
    locale: { language: "en", first_weekday: "monday" },
    config: { version: "2026.4.0" },
    states: { [STATE.entity_id]: STATE },
    formatEntityName,
    ...overrides,
  } as unknown as HomeAssistant;
}

function parse(
  entities: InputConfig["entities"],
  hass: HomeAssistant = createHass(),
  extra: Partial<InputConfig> = {},
) {
  return new ConfigParser().update({
    yaml: {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities,
      ...extra,
    } as InputConfig,
    hass,
    css_vars: cssVars,
  });
}

const nameOf = (result: { parsed: { entities: EntityConfig[] } }) =>
  (result.parsed.entities[0] as any).name;

describe("entity names", () => {
  beforeAll(() => {
    (global as any).window = {};
  });
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("composes the default name from the registry context", async () => {
    const result = await parse([{ entity: STATE.entity_id }]);
    expect(nameOf(result)).toBe("Living room Thermostat Temperature");
  });

  it("keeps a plain string name", async () => {
    const result = await parse([{ entity: STATE.entity_id, name: "Inside" }]);
    expect(nameOf(result)).toBe("Inside");
  });

  it("resolves a structured name", async () => {
    const result = await parse([
      {
        entity: STATE.entity_id,
        name: [{ type: "area" }, { type: "entity" }],
      } as any,
    ]);
    expect(nameOf(result)).toBe("<area> <entity>");
  });

  // The legacy `entity::attribute` syntax rewrites entity_id, so the name has to
  // be resolved after that split or the state lookup misses and falls back to
  // the id. A configured name is used verbatim, without the attribute suffix
  // that only the default adds.
  it("resolves a structured name with the legacy attribute syntax", async () => {
    const result = await parse([
      {
        entity: `${STATE.entity_id}::friendly_name`,
        name: [{ type: "entity" }],
      } as any,
    ]);
    expect(nameOf(result)).toBe("<entity>");
  });

  it("resolves a structured name from defaults, unless the entity sets its own", async () => {
    const defaults = {
      defaults: { entity: { name: [{ type: "area" }, { type: "entity" }] } },
    } as any;
    const result = await parse(
      [
        STATE.entity_id,
        { entity: STATE.entity_id, name: [{ type: "device" }] },
      ] as any,
      createHass(),
      defaults,
    );
    expect(result.parsed.entities.map((e: any) => e.name)).toEqual([
      "<area> <entity>",
      "<device>",
    ]);
  });

  it("treats an empty name as no name configured", async () => {
    const result = await parse([{ entity: STATE.entity_id, name: "" }]);
    expect(nameOf(result)).toBe("Living room Thermostat Temperature");
  });

  // The trendline filter renames its trace by rewriting meta.friendly_name, and
  // so can any custom `fn` filter. The default name has to honour that.
  it("keeps a name a filter put on meta", async () => {
    const result = await parse([
      {
        entity: STATE.entity_id,
        filters: [{ trendline: { type: "linear" } }],
      } as any,
    ]);
    expect(nameOf(result)).toBe("Trend");
  });

  it("falls back to friendly_name when the formatter is missing", async () => {
    const hass = createHass({ formatEntityName: undefined } as any);
    const result = await parse([{ entity: STATE.entity_id }], hass);
    expect(nameOf(result)).toBe("Living room Thermostat Temperature");
  });
});
