import { addPostParsingDefaults, addPreParsingDefaults } from "./defaults";
import { Config, InputConfig, InputEntityOptions } from "../types";
import { HATheme } from "./themed-layout";
import { FilterInput } from "../filters/filters";

function apply(overrides: Partial<Config> = {}) {
  return addPostParsingDefaults({
    entities: [],
    layout: {},
    config: {},
    raw_plotly_config: false,
    visible_range: [0, 100],
    ...overrides,
  } as Config);
}

describe("Plotly 4 compatibility", () => {
  test.each([false, true])(
    "cloud upload stays opt-in (raw=%s)",
    (raw_plotly_config) => {
      expect(apply({ raw_plotly_config }).config).toMatchObject({
        showSendToCloud: false,
        doubleClickDelay: 300,
      });
    },
  );

  test("explicit interaction settings are respected", () => {
    expect(
      apply({ config: { showSendToCloud: true, doubleClickDelay: 600 } })
        .config,
    ).toMatchObject({ showSendToCloud: true, doubleClickDelay: 600 });
  });

  test("overlaid axes leave tick defaults to Plotly without mutating input", () => {
    const layout = { yaxis2: { overlaying: "y" as const } };
    expect(apply({ layout }).layout.yaxis2).not.toHaveProperty("tickmode");
    expect(layout.yaxis2).not.toHaveProperty("tickmode");
  });

  test.each([
    { tickmode: "sync" as const },
    { tickmode: "linear" as const, dtick: 5 },
    { tickvals: [0, 10, 100] },
    { dtick: 5 },
  ])("explicit or inferred ticks are preserved: %j", (ticks) => {
    expect(
      apply({ layout: { yaxis2: { overlaying: "y", ...ticks } } }).layout
        .yaxis2,
    ).toEqual({ overlaying: "y", ...ticks });
  });

  test("template tick settings are respected", () => {
    const layout = {
      template: { layout: { yaxis2: { tickmode: "sync" as const } } },
      yaxis2: { overlaying: "y" as const },
    };
    expect(apply({ layout }).layout.yaxis2).not.toHaveProperty("tickmode");
  });

  test("raw configurations use native axis defaults", () => {
    expect(
      apply({
        raw_plotly_config: true,
        layout: { yaxis2: { overlaying: "y" } },
      }).layout.yaxis2,
    ).not.toHaveProperty("tickmode");
  });

  test("unit labels use the supported axis title format", () => {
    const entities = [
      { entity: "sensor.test", yaxis: "y", unit_of_measurement: "W" },
    ];
    expect(
      apply({ entities: entities as Config["entities"] }).layout.yaxis?.title,
    ).toEqual({ text: "W" });
  });

  test("explicit title and range win over defaults", () => {
    const layout: Partial<Plotly.Layout> = {
      yaxis: { title: { text: "Power" } },
      xaxis: { range: [20, 30] },
    };
    const entities = [
      { entity: "sensor.test", yaxis: "y", unit_of_measurement: "W" },
    ];
    const result = apply({ layout, entities: entities as Config["entities"] });
    expect(result.layout.yaxis?.title).toEqual({ text: "Power" });
    expect(result.layout.xaxis?.range).toEqual([20, 30]);
  });
});

describe("entity filters and defaults.entity.filters", () => {
  const cssVars = {} as HATheme;

  beforeEach(() => {
    (global as any).window = {};
  });

  afterEach(() => {
    delete (global as any).window;
  });
  const defaultFilters: FilterInput[] = [{ multiply: 2 }, "force_numeric"];

  function entityFilters(
    entities: InputConfig["entities"],
    defaults: { entity?: Pick<InputEntityOptions, "filters"> } = {
      entity: { filters: defaultFilters },
    },
  ) {
    const yaml = addPreParsingDefaults(
      {
        type: "custom:plotly-graph",
        ha_theme: false,
        entities,
        defaults: defaults as InputConfig["defaults"],
      },
      cssVars,
    );
    return yaml.entities.map((entity) => entity.filters);
  }

  test("entities without filters use the default filters", () => {
    expect(entityFilters([{ entity: "sensor.a" }, "sensor.b"])).toEqual([
      defaultFilters,
      defaultFilters,
    ]);
  });

  test("entity filters replace the default filters", () => {
    expect(
      entityFilters([
        { entity: "sensor.a", filters: [{ add: 1 }] },
        { entity: "sensor.b" },
      ]),
    ).toEqual([[{ add: 1 }], defaultFilters]);
  });

  test("longer entity filters are not padded with default filters", () => {
    expect(
      entityFilters([
        {
          entity: "sensor.a",
          filters: [{ add: 1 }, { multiply: 3 }, "delta"],
        },
      ]),
    ).toEqual([[{ add: 1 }, { multiply: 3 }, "delta"]]);
  });

  test("filters with the same position and name are not merged", () => {
    expect(
      entityFilters(
        [{ entity: "sensor.a", filters: [{ resample: { interval: "1h" } }] }],
        { entity: { filters: [{ resample: { interpolate: true } }] } },
      ),
    ).toEqual([[{ resample: { interval: "1h" } }]]);
  });

  test("an empty filter list disables the default filters", () => {
    expect(entityFilters([{ entity: "sensor.a", filters: [] }])).toEqual([[]]);
  });

  test("entity filters are used when there are no default filters", () => {
    expect(
      entityFilters([{ entity: "sensor.a", filters: ["delta"] }], {}),
    ).toEqual([["delta"]]);
  });

  test("entities get their own copy of the filters", () => {
    const entityFilter: FilterInput = { add: 1 };
    const [a, b] = entityFilters([
      { entity: "sensor.a" },
      { entity: "sensor.b", filters: [entityFilter] },
    ]);
    expect(a![0]).not.toBe(defaultFilters[0]);
    expect(b![0]).not.toBe(entityFilter);
  });
});
