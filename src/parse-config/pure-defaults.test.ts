import { HomeAssistant } from "custom-card-helpers";
import { InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
import { pureDefault } from "./pure-default";
import { HATheme } from "./themed-layout";

const NOW = Date.parse("2025-01-02T12:00:00Z");

function fixture(entities: unknown[]) {
  const callWS = jest.fn(async ({ entity_ids }) =>
    Object.fromEntries(
      entity_ids.map((entity: string) => [
        entity,
        [
          { s: "1", lu: NOW / 1000 - 120 },
          { s: "2", lu: NOW / 1000 - 60 },
        ],
      ]),
    ),
  );
  return {
    yaml: {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities,
    } as InputConfig,
    hass: {
      callWS,
      states: {
        "sensor.first": {
          state: "2",
          attributes: { unit_of_measurement: "W", friendly_name: "First" },
        },
        "sensor.second": {
          state: "2",
          attributes: { unit_of_measurement: "m", friendly_name: "Second" },
        },
      },
      locale: { language: "en", first_weekday: "monday" },
    } as unknown as HomeAssistant,
    css_vars: {} as HATheme,
  };
}

describe("on-demand internal defaults", () => {
  beforeEach(() => {
    (global as any).window = { eval };
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).window;
  });

  it("resolves default dependencies before their YAML position with their own relative paths", async () => {
    const input = fixture([
      {
        entity: "sensor.first",
        hovertemplate:
          '$ex `${get(".name")}: %{y} ${get(".unit_of_measurement")}`',
        texttemplate:
          '$ex `${get(".yaxis")}: ${get(".hovertemplate")}/${get("entities.0.line.color")}`',
      },
    ]);
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      name: "First",
      unit_of_measurement: "W",
      yaxis: "y",
      hovertemplate: "First: %{y} W",
      texttemplate: "y: First: %{y} W/#1f77b4",
      line: { color: "#1f77b4" },
    });
    expect(input.hass.callWS).toHaveBeenCalledTimes(1);
  });

  it("evaluates a default once per update, including its later normal traversal", async () => {
    const formatEntityName = jest.fn(() => "Formatted first");
    const input = fixture([
      {
        entity: "sensor.first",
        texttemplate: '$ex `${get(".name")}/${get(".name")}`',
      },
    ]);
    input.hass = {
      ...input.hass,
      config: { version: "2026.4.0" },
      formatEntityName,
    } as unknown as HomeAssistant;
    const parser = new ConfigParser();
    expect((await parser.update(input)).parsed.entities[0]).toMatchObject({
      name: "Formatted first",
      texttemplate: "Formatted first/Formatted first",
    });
    expect(formatEntityName).toHaveBeenCalledTimes(1);
    formatEntityName.mockReturnValue("Updated first");
    expect((await parser.update(input)).parsed.entities[0]).toMatchObject({
      name: "Updated first",
      texttemplate: "Updated first/Updated first",
    });
    expect(formatEntityName).toHaveBeenCalledTimes(2);
  });

  it("also caches an undefined global default before its container is traversed", async () => {
    const language = jest.fn(() => undefined);
    const input = fixture([
      {
        entity: "sensor.first",
        texttemplate: '$ex `${get("config.locale")}/${get("config.locale")}`',
      },
    ]);
    Object.defineProperty(input.hass.locale, "language", { get: language });
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      texttemplate: "undefined/undefined",
    });
    expect(parsed.config.locale).toBeUndefined();
    expect(language).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit values and does not run user functions ahead of their position", async () => {
    const literal = fixture([
      {
        entity: "sensor.first",
        hovertemplate: '$ex get(".unit_of_measurement")',
        unit_of_measurement: "kW",
      },
    ]);
    expect(
      (await new ConfigParser().update(literal)).parsed.entities[0],
    ).toMatchObject({ hovertemplate: "kW", unit_of_measurement: "kW" });

    const order: string[] = [];
    jest.spyOn(console, "warn").mockImplementation();
    const input = fixture([
      {
        entity: "sensor.first",
        hovertemplate: ({ get }) => {
          order.push("template");
          return get(".unit_of_measurement");
        },
        unit_of_measurement: () => {
          order.push("unit");
          return "kW";
        },
      },
    ]);
    const { errors } = await new ConfigParser().update(input);
    expect(
      errors.some((error) =>
        error.message.includes("has to be defined before"),
      ),
    ).toBe(true);
    expect(order).toEqual(["template", "unit"]);
  });

  it("never uses the current entity's metadata for a future entity default", async () => {
    jest.spyOn(console, "warn").mockImplementation();
    const input = fixture([
      {
        entity: "sensor.first",
        hovertemplate: '$ex get("entities.1.unit_of_measurement")',
      },
      { entity: "sensor.second" },
    ]);
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(
      errors.some((error) =>
        error.message.includes("entities.1.unit_of_measurement"),
      ),
    ).toBe(true);
    expect(parsed.entities[1].unit_of_measurement).toBe("m");
  });

  it("keeps the ordering error for fetch settings that request metadata before fetching", async () => {
    jest.spyOn(console, "warn").mockImplementation();
    const input = fixture([
      {
        entity: "sensor.first",
        attribute: '$ex get(".unit_of_measurement")',
      },
    ]);
    const { errors } = await new ConfigParser().update(input);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.every((error) =>
        error.message.includes("has to be defined before"),
      ),
    ).toBe(true);
  });

  it("uses the filtered metadata without changing the caller's path or vars", async () => {
    const input = fixture([
      {
        entity: "sensor.first",
        filters: [
          {
            fn: '({meta}) => ({meta: {...meta, friendly_name: "Filtered", unit_of_measurement: "kW"}})',
          },
        ],
        texttemplate:
          '$fn ({get, path, vars}) => { vars.before = path; const value = get(".hovertemplate"); return `${vars.before}/${path}/${value}`; }',
      },
    ]);
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(parsed.entities[0]).toMatchObject({
      name: "Filtered",
      unit_of_measurement: "kW",
      texttemplate:
        "entities.0.texttemplate/entities.0.texttemplate/<b>Filtered</b><br><i>%{x}</i><br>%{y} kW<extra></extra>",
    });
  });

  it("reports circular internal dependencies instead of recursing indefinitely", async () => {
    jest.spyOn(console, "warn").mockImplementation();
    const input = fixture([
      {
        entity: "sensor.first",
        unit_of_measurement: pureDefault(({ get }) => get(".hovertemplate")),
        hovertemplate: pureDefault(({ get }) => get(".unit_of_measurement")),
      },
    ]);
    const { errors } = await new ConfigParser().update(input);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.every((error) =>
        error.message.includes("Circular default dependency"),
      ),
    ).toBe(true);
  });
});
