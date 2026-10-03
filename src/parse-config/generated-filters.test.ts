import { HomeAssistant } from "custom-card-helpers";
import { ConfigParser } from "./parse-config";
import { HATheme } from "./themed-layout";
import { EntityConfig, InputConfig } from "../types";

const NOW = Date.parse("2025-01-02T12:00:00Z");
const entity = "sensor.test";
const yValues = (trace: EntityConfig) => ("y" in trace ? trace.y : undefined);

function createInput(filters: unknown) {
  const callWS = jest.fn(async () => ({
    [entity]: [
      { s: "1", lu: NOW / 1000 - 120 },
      { s: "2", lu: NOW / 1000 - 60 },
    ],
  }));
  const input = {
    yaml: {
      type: "custom:plotly-graph",
      hours_to_show: 24,
      entities: [{ entity, extend_to_present: false, filters }],
    } as InputConfig,
    hass: {
      callWS,
      states: { [entity]: { state: "2", attributes: {} } },
      locale: { language: "en", first_weekday: "monday" },
    } as unknown as HomeAssistant,
    css_vars: {} as HATheme,
  };
  return { input, callWS };
}

describe("generated filter lists", () => {
  beforeEach(() => {
    (global as any).window = { eval };
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).window;
  });

  it.each([
    ["literal", [{ map_y: "0" }]],
    ["expression", '$ex [{ map_y: "0" }]'],
    ["function expression", '$fn () => [{ map_y: "0" }]'],
    ["function", () => [{ map_y: "0" }]],
  ])("runs filters from a %s list", async (_label, filters) => {
    const { input, callWS } = createInput(filters);
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual([0, 0]);
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("combines reused filters and relative entity filters in order", async () => {
    const { input } = createInput(undefined);
    input.yaml = {
      ...input.yaml,
      reused_filters: ["force_numeric", { add: 1 }],
      entities: [
        {
          entity,
          extend_to_present: false,
          extra_filters: [{ multiply: 3 }],
          filters: "$ex [...get('reused_filters'), ...get('.extra_filters')]",
        },
      ],
    } as unknown as InputConfig;
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual([6, 9]);
  });

  it("evaluates entries and parameters against the preceding filter result", async () => {
    const { input } = createInput(
      '$ex ["force_numeric", { add: 1 }, "$ex ({ multiply: ys[0] })"]',
    );
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual([4, 6]);
  });

  it("executes each filter once and does not mutate a reused list", async () => {
    const list = [
      {
        fn: "({ ys, vars }) => { vars.calls = (vars.calls || 0) + 1; return { ys: ys.map(y => Number(y) + 1) }; }",
      },
      { multiply: 2 },
    ];
    const generate = jest.fn(() => list);
    const { input } = createInput(generate);
    Object.assign(input.yaml.entities[0], { customdata: "$ex [vars.calls]" });
    const parser = new ConfigParser();
    for (let refresh = 0; refresh < 2; refresh++) {
      const { parsed, errors } = await parser.update(input);
      expect(errors).toEqual([]);
      expect(parsed.entities[0]).toMatchObject({ y: [4, 6], customdata: [1] });
    }
    expect(generate).toHaveBeenCalledTimes(2);
    expect(list).toEqual([
      {
        fn: "({ ys, vars }) => { vars.calls = (vars.calls || 0) + 1; return { ys: ys.map(y => Number(y) + 1) }; }",
      },
      { multiply: 2 },
    ]);
  });

  it("evaluates generated filter parameters", async () => {
    const { input } = createInput(
      '$ex ["force_numeric", { add: "$ex ys[0]" }, { multiply: 2 }]',
    );
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual([4, 6]);
  });

  it("does not impose a size cutoff on generated lists", async () => {
    const { input } = createInput(
      "$ex Array.from({ length: 150 }, () => ({ add: 1 }))",
    );
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual([151, 152]);
  });

  it("uses generated default filters unless an entity overrides them", async () => {
    const { input } = createInput(undefined);
    input.yaml.defaults = {
      entity: { filters: "$ex [{ multiply: 2 }]" },
    } as unknown as InputConfig["defaults"];
    input.yaml.entities.push({ entity, filters: [] });
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual([2, 4]);
    expect(yValues(parsed.entities[1])).toEqual(["1", "2", "2"]);
  });

  it("accepts an empty generated list", async () => {
    const { input } = createInput("$ex []");
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toEqual(["1", "2"]);
  });

  it("reports invalid filters at their list index", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { input } = createInput("$ex [{ not_a_filter: 1 }]");
    const { errors } = await new ConfigParser().update(input);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("entities.0.filters.0");
    expect(errors[0].message).toContain("not_a_filter");
  });

  it.each(["null", "{}", "42"])(
    "reports a generated non-array list: %s",
    async (value) => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      const { input } = createInput(`$ex ${value}`);
      const { errors } = await new ConfigParser().update(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("entities.0.filters");
      expect(errors[0].message).toContain("filters must evaluate to an array");
    },
  );

  it("does not traverse large data arrays returned by other functions", async () => {
    const values = Array.from({ length: 100_000 }, (_, i) => i);
    const { input } = createInput("$ex []");
    Object.assign(input.yaml.entities[0], { y: () => values });
    const entries = jest.spyOn(Object, "entries");
    const { parsed, errors } = await new ConfigParser().update(input);
    expect(errors).toEqual([]);
    expect(yValues(parsed.entities[0])).toBe(values);
    expect(entries).not.toHaveBeenCalledWith(values);
  });
});
