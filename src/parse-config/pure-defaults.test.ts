import { HomeAssistant } from "custom-card-helpers";
import { InputConfig } from "../types";
import { ConfigParser } from "./parse-config";
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

  it("refreshes resolved defaults when the next update changes the entity name", async () => {
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
    formatEntityName.mockReturnValue("Updated first");
    expect((await parser.update(input)).parsed.entities[0]).toMatchObject({
      name: "Updated first",
      texttemplate: "Updated first/Updated first",
    });
  });

  it("preserves explicit values ahead of their YAML position", async () => {
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
  });

  it("does not run user functions ahead of their YAML position", async () => {
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

  it("does not cache pre-filter metadata or change the resulting axis grouping", async () => {
    jest.spyOn(console, "warn").mockImplementation();
    const input = fixture([
      {
        entity: "sensor.first",
        texttemplate: '$ex get(".unit_of_measurement")',
        filters: [{ derivate: "h" }],
      },
      { entity: "sensor.first" },
    ]);
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("has to be defined before");
    expect(parsed.entities[0]).toMatchObject({
      unit_of_measurement: "W/h",
      yaxis: "y",
      hovertemplate: expect.stringContaining("W/h"),
    });
    expect(parsed.entities[1]).toMatchObject({
      unit_of_measurement: "W",
      yaxis: "y2",
    });
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
});
