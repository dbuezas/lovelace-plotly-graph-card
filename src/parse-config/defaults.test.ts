import {
  addPostParsingDefaults,
  addPreParsingDefaults,
  getEditorYAxisRelayout,
} from "./defaults";
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

describe("visual editor y-axis bounds", () => {
  test.each([
    [{ min_y_axis: 300, max_y_axis: 1500 }, [300, 1500]],
    [{ min_y_axis: 300 }, [300, null]],
    [{ max_y_axis: 1500 }, [null, 1500]],
    [{ min_y_axis: 0 }, [0, null]],
    [{ max_y_axis: 0 }, [null, 0]],
    [{ min_y_axis: 0, max_y_axis: 0 }, [0, 0]],
  ])("maps bounds %j to a Plotly range", (bounds, range) => {
    expect(apply(bounds).layout.yaxis?.range).toEqual(range);
  });

  test("leaves the axis automatic when no bounds are configured", () => {
    expect(apply().layout.yaxis).toBeUndefined();
  });

  test.each<Plotly.LayoutAxis>([
    { range: [500, 2000] },
    { range: [null, 2000] },
    { autorange: true },
    { autorange: false },
    { autorange: "reversed" as const },
  ])("preserves explicit Plotly axis settings: %j", (yaxis) => {
    const result = apply({
      min_y_axis: 300,
      max_y_axis: 1500,
      layout: { yaxis },
    });
    expect(result.layout.yaxis).toEqual(yaxis);
  });

  test("preserves other axis settings without mutating input", () => {
    const layout: Partial<Plotly.Layout> = {
      yaxis: { title: { text: "CO2" }, showgrid: false },
      yaxis2: { range: [0, 100] },
    };
    const result = apply({ min_y_axis: 300, max_y_axis: 1500, layout });
    expect(result.layout.yaxis).toEqual({
      ...layout.yaxis,
      range: [300, 1500],
    });
    expect(result.layout.yaxis2).toEqual(layout.yaxis2);
    expect(layout.yaxis).not.toHaveProperty("range");
  });

  test("ignores non-finite bounds", () => {
    expect(
      apply({ min_y_axis: NaN, max_y_axis: Infinity }).layout.yaxis,
    ).toBeUndefined();
  });

  test("converts logarithmic bounds from data units", () => {
    expect(
      apply({
        min_y_axis: 300,
        max_y_axis: 1500,
        layout: { yaxis: { type: "log" } },
      }).layout.yaxis?.range,
    ).toEqual([Math.log10(300), Math.log10(1500)]);
  });

  test.each([0, -1, NaN, Infinity])(
    "ignores invalid logarithmic bounds: %s",
    (bound) => {
      expect(
        apply({
          min_y_axis: bound,
          max_y_axis: 1000,
          logarithmic_scale: true,
        }).layout.yaxis,
      ).toEqual({
        type: "log",
        range: [null, 3],
      });
    },
  );

  test("leaves log scaling automatic when both bounds are invalid", () => {
    expect(
      apply({
        min_y_axis: -1,
        max_y_axis: 0,
        logarithmic_scale: true,
      }).layout.yaxis,
    ).toEqual({ type: "log" });
  });

  test.each([false, true])(
    "ignores inverted editor bounds (fit=%s)",
    (fit_y_data) => {
      expect(
        apply({ min_y_axis: 1500, max_y_axis: 300, fit_y_data }).layout.yaxis,
      ).toBeUndefined();
    },
  );

  test.each([{ min_y_axis: 2000 }, { max_y_axis: 300 }, { min_y_axis: 0 }])(
    "marks partial editor bounds for range validation: %j",
    (bounds) => {
      expect(apply(bounds).editor_y_axis).toEqual({ partial_bound: true });
    },
  );

  test.each([
    [{ min_y_axis: 300, max_y_axis: 1500 }, [300, 1500]],
    [{ min_y_axis: 300 }, [300]],
    [{ max_y_axis: 1500 }, [1500]],
  ])("fits data and editor bounds together: %j", (bounds, include) => {
    expect(apply({ ...bounds, fit_y_data: true }).layout.yaxis).toEqual({
      autorange: true,
      autorangeoptions: { include },
    });
  });

  test("fit bounds stay in data units on a logarithmic axis", () => {
    const result = apply({
      min_y_axis: 300,
      max_y_axis: 1500,
      fit_y_data: true,
      logarithmic_scale: true,
    });
    expect(result.layout.yaxis).toEqual({
      type: "log",
      autorange: true,
    });
    expect(result.editor_y_axis).toEqual({ log_fit_bounds: [300, 1500] });
  });

  test.each([false, true])(
    "maps the editor's logarithmic toggle: %s",
    (logarithmic_scale) => {
      expect(apply({ logarithmic_scale }).layout.yaxis?.type).toBe(
        logarithmic_scale ? "log" : undefined,
      );
    },
  );

  test("disabling logarithmic scale leaves other axis settings unchanged", () => {
    const yaxis = { showgrid: false, title: { text: "State" } };
    expect(
      apply({ logarithmic_scale: false, layout: { yaxis } }).layout.yaxis,
    ).toEqual(yaxis);
  });

  test.each(["linear", "log", "date", "category"] as const)(
    "disabling logarithmic scale preserves an explicit %s axis",
    (type) => {
      expect(
        apply({ logarithmic_scale: false, layout: { yaxis: { type } } }).layout
          .yaxis?.type,
      ).toBe(type);
    },
  );

  test("explicit Plotly type overrides the logarithmic toggle", () => {
    expect(
      apply({
        logarithmic_scale: true,
        min_y_axis: 300,
        max_y_axis: 1500,
        layout: { yaxis: { type: "linear" } },
      }).layout.yaxis,
    ).toEqual({ type: "linear", range: [300, 1500] });
  });

  test("template type overrides the toggle and controls bound conversion", () => {
    const layout: Partial<Plotly.Layout> = {
      template: { layout: { yaxis: { type: "log" } } },
    };
    const result = apply({
      logarithmic_scale: false,
      min_y_axis: 300,
      max_y_axis: 1500,
      layout,
    });
    expect(result.layout.yaxis).toEqual({
      range: [Math.log10(300), Math.log10(1500)],
    });
    expect(layout.yaxis).toBeUndefined();
  });

  test("accepts an explicitly empty Plotly template", () => {
    const layout = JSON.parse('{"template":null}');
    expect(
      apply({ min_y_axis: 300, max_y_axis: 1500, layout }).layout.yaxis?.range,
    ).toEqual([300, 1500]);
  });

  test.each<Plotly.LayoutAxis>([
    { range: [500, 2000] },
    { autorange: false },
    { autorangeoptions: { include: [100] } },
  ])("template range settings override editor bounds: %j", (yaxis) => {
    const layout: Partial<Plotly.Layout> = { template: { layout: { yaxis } } };
    expect(
      apply({ min_y_axis: 300, max_y_axis: 1500, fit_y_data: true, layout })
        .layout,
    ).toEqual({ ...layout, xaxis: { range: [0, 100] }, margin: { r: 30 } });
  });

  test("explicit autorange options override editor bounds", () => {
    const yaxis = { autorangeoptions: { include: [100] } };
    expect(
      apply({
        min_y_axis: 300,
        max_y_axis: 1500,
        fit_y_data: true,
        layout: { yaxis },
      }).layout.yaxis,
    ).toEqual(yaxis);
  });

  test.each(["date", "category"] as const)(
    "does not apply numeric bounds to a %s axis",
    (type) => {
      expect(
        apply({
          min_y_axis: 300,
          max_y_axis: 1500,
          layout: { yaxis: { type } },
        }).layout.yaxis,
      ).toEqual({ type });
    },
  );

  test.each([{ min_y_axis: 2000 }, { min_y_axis: 300, max_y_axis: 1500 }])(
    "scroll autorange overrides fixed editor bounds: %j",
    (bounds) => {
      const result = apply({ ...bounds, autorange_after_scroll: true });
      expect(result.layout.yaxis).toBeUndefined();
      expect(result.editor_y_axis).toBeUndefined();
    },
  );

  test("scroll autorange keeps fitting editor bounds", () => {
    expect(
      apply({
        min_y_axis: 300,
        max_y_axis: 1500,
        fit_y_data: true,
        autorange_after_scroll: true,
      }).layout.yaxis,
    ).toEqual({ autorange: true, autorangeoptions: { include: [300, 1500] } });
  });
});

describe("editor bounds after Plotly autorange", () => {
  test.each([
    [2000, 1038],
    [600, 300],
    [300, 300],
  ])(
    "drops a partial bound if Plotly calculates a reversed or collapsed range: %j",
    (...range) => {
      expect(
        getEditorYAxisRelayout(apply({ min_y_axis: 2000 }), range),
      ).toEqual({ "yaxis.range": [null, null], "yaxis.autorange": true });
    },
  );

  test("leaves valid partial ranges alone", () => {
    expect(
      getEditorYAxisRelayout(apply({ min_y_axis: 300 }), [300, 1038]),
    ).toBeUndefined();
  });

  test("does not change an explicitly reversed Plotly axis", () => {
    const yaml = apply({
      min_y_axis: 300,
      layout: { yaxis: { range: [1500, 300] } },
    });
    expect(getEditorYAxisRelayout(yaml, [1500, 300])).toBeUndefined();
  });

  test.each([
    [
      { min_y_axis: 300, max_y_axis: 1500 },
      [2.7, 3.1],
      [Math.log10(300), Math.log10(1500)],
    ],
    [{ min_y_axis: 0.01, max_y_axis: 2 }, [-1, 0], [-2, Math.log10(2)]],
    [{ min_y_axis: 300 }, [2.7, 3.1], [Math.log10(300), 3.1]],
    [{ max_y_axis: 1500 }, [2.7, 3.1], [2.7, Math.log10(1500)]],
  ])(
    "expands native logarithmic autorange to include editor bounds: %j",
    (bounds, range, expected) => {
      const yaml = apply({
        ...bounds,
        fit_y_data: true,
        logarithmic_scale: true,
      });
      expect(getEditorYAxisRelayout(yaml, range)).toEqual({
        "yaxis.range": expected,
        "yaxis.autorange": false,
      });
    },
  );

  test("does not relayout when logarithmic data already includes the bounds", () => {
    const yaml = apply({
      min_y_axis: 300,
      max_y_axis: 1500,
      fit_y_data: true,
      logarithmic_scale: true,
    });
    expect(getEditorYAxisRelayout(yaml, [2, 4])).toBeUndefined();
  });

  test.each([
    { range: undefined },
    { range: [] },
    { range: [0] },
    { range: [null, 1] },
    { range: [NaN, 1] },
    { range: [0, Infinity] },
  ])("does not relayout missing or invalid native ranges: %j", ({ range }) => {
    const yaml = apply({
      min_y_axis: 300,
      fit_y_data: true,
      logarithmic_scale: true,
    });
    expect(getEditorYAxisRelayout(yaml, range)).toBeUndefined();
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
