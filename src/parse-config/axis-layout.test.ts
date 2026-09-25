jest.mock("../filters/filters", () => ({}));

import {
  getCartesianLayoutAxes,
  getRememberedConfiguredAxes,
  pruneUnusedCartesianAxes,
} from "./axis-layout";
import { Config, EntityConfig, InputConfig } from "../types";
import { addPostParsingDefaults, addPreParsingDefaults } from "./defaults";

const axes = {
  xaxis: {},
  xaxis2: {},
  xaxis3: {},
  xaxis4: {},
  xaxis5: {},
  yaxis: {},
  yaxis2: {},
  yaxis3: {},
  yaxis4: {},
  yaxis6: {},
  legend: { orientation: "h" },
} as Partial<Plotly.Layout>;

function entity(xaxis = "x", yaxis = "y"): EntityConfig {
  return { xaxis, yaxis } as EntityConfig;
}

describe("pruneUnusedCartesianAxes", () => {
  it("keeps only the base axes for a simple trace", () => {
    const layout = pruneUnusedCartesianAxes(axes, [entity()], new Set());

    expect(Object.keys(layout)).toStrictEqual(["xaxis", "yaxis", "legend"]);
  });

  it("keeps axes referenced by traces", () => {
    const layout = pruneUnusedCartesianAxes(
      axes,
      [entity("x2", "y3")],
      new Set(),
    );

    expect(Object.keys(layout)).toStrictEqual([
      "xaxis",
      "xaxis2",
      "yaxis",
      "yaxis3",
      "legend",
    ]);
  });

  it("keeps explicitly configured axes without traces", () => {
    const layout = pruneUnusedCartesianAxes(
      axes,
      [entity()],
      new Set(["xaxis4", "yaxis2"]),
    );

    expect(Object.keys(layout)).toStrictEqual([
      "xaxis",
      "xaxis4",
      "yaxis",
      "yaxis2",
      "legend",
    ]);
  });

  it("keeps axes referenced by layout objects", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        shapes: [{ xref: "x5", yref: "y6" }],
      } as Partial<Plotly.Layout>,
      [entity()],
      new Set(),
    );

    expect(Object.keys(layout)).toStrictEqual([
      "xaxis",
      "xaxis5",
      "yaxis",
      "yaxis6",
      "legend",
      "shapes",
    ]);
  });

  it("keeps axes referenced by another axis", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        xaxis4: { anchor: "y3" },
      },
      [entity()],
      new Set(["xaxis4"]),
    );

    expect(Object.keys(layout)).toStrictEqual([
      "xaxis",
      "xaxis4",
      "yaxis",
      "yaxis3",
      "legend",
    ]);
  });

  it("keeps domain references in shapes and annotations", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        shapes: [{ xref: "x5 domain", yref: "y6 domain" }],
        annotations: [{ xref: "x4 domain", yref: "y3 domain" }],
      } as Partial<Plotly.Layout>,
      [entity()],
      new Set(),
    );
    expect(getCartesianLayoutAxes(layout)).toEqual(
      new Set(["xaxis", "yaxis", "xaxis5", "yaxis6", "xaxis4", "yaxis3"]),
    );
  });

  it("keeps axes from grid subplot identifiers", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        grid: {
          subplots: [
            ["xy", "x2y3"],
            ["x4y6", ""],
          ],
        },
      } as unknown as Partial<Plotly.Layout>,
      [entity()],
      new Set(),
    );
    expect(getCartesianLayoutAxes(layout)).toEqual(
      new Set(["xaxis", "yaxis", "xaxis2", "yaxis3", "xaxis4", "yaxis6"]),
    );
  });

  it("keeps independent grid axis references", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        grid: { xaxes: ["x", "x2"], yaxes: ["y3", "y6"] },
      } as Partial<Plotly.Layout>,
      [entity()],
      new Set(),
    );
    expect(getCartesianLayoutAxes(layout)).toEqual(
      new Set(["xaxis", "yaxis", "xaxis2", "yaxis3", "yaxis6"]),
    );
  });

  it("keeps axes configured by slider and update menu actions", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        sliders: [
          { steps: [{ method: "relayout", args: ["xaxis4.range", [0, 10]] }] },
        ],
        updatemenus: [
          {
            buttons: [
              { method: "relayout", args: [{ "yaxis6.range": [0, 10] }] },
            ],
          },
        ],
      } as Partial<Plotly.Layout>,
      [entity()],
      new Set(),
    );
    expect(getCartesianLayoutAxes(layout)).toEqual(
      new Set(["xaxis", "yaxis", "xaxis4", "yaxis6"]),
    );
  });

  it("follows axis dependencies transitively", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        xaxis4: { anchor: "y3" },
        yaxis3: { scaleanchor: "x5" },
        xaxis5: { matches: "x2" },
      },
      [entity()],
      new Set(["xaxis4"]),
    );
    expect(getCartesianLayoutAxes(layout)).toEqual(
      new Set(["xaxis", "yaxis", "xaxis4", "yaxis3", "xaxis5", "xaxis2"]),
    );
  });

  it("does not retain dependencies of unused generated axes", () => {
    const layout = pruneUnusedCartesianAxes(
      {
        ...axes,
        xaxis4: { anchor: "y6" },
      },
      [entity()],
      new Set(),
    );
    expect(getCartesianLayoutAxes(layout)).toEqual(new Set(["xaxis", "yaxis"]));
  });

  it("handles repeated and cyclic objects without mutating the layout", () => {
    const annotation: any = { xref: "x4", yref: "y3" };
    annotation.self = annotation;
    const input: Partial<Plotly.Layout> = {
      ...axes,
      annotations: [annotation, annotation],
    };
    const output = pruneUnusedCartesianAxes(input, [entity()], new Set());
    expect(getCartesianLayoutAxes(output)).toEqual(
      new Set(["xaxis", "yaxis", "xaxis4", "yaxis3"]),
    );
    expect(input.xaxis5).toBe(axes.xaxis5);
    expect(output.annotations).toBe(input.annotations);
  });
});

describe("configured axes", () => {
  it("finds cartesian layout keys", () => {
    expect(
      getCartesianLayoutAxes({
        xaxis2: {},
        yaxis4: {},
        legend: {},
      } as Partial<Plotly.Layout>),
    ).toStrictEqual(new Set(["xaxis2", "yaxis4"]));
  });

  it("remembers axes configured directly and through a preset", () => {
    const previousWindow = global.window;
    global.window = {
      PlotlyGraphCardPresets: {
        secondary: {
          layout: { yaxis4: {} },
        },
      },
    } as unknown as Window & typeof globalThis;
    try {
      const config = addPreParsingDefaults(
        {
          type: "custom:plotly-graph",
          entities: [],
          preset: "secondary",
          layout: { xaxis2: {} },
          ha_theme: false,
          raw_plotly_config: true,
        },
        {} as Parameters<typeof addPreParsingDefaults>[1],
      );

      expect(getRememberedConfiguredAxes(config)).toStrictEqual(
        new Set(["xaxis2", "yaxis4"]),
      );
    } finally {
      global.window = previousWindow;
    }
  });
});

describe("post-parsing axis defaults", () => {
  it("removes generated axes that are not used by the parsed config", () => {
    const config = addPostParsingDefaults(
      {
        entities: [entity()],
        layout: axes,
        raw_plotly_config: true,
        visible_range: [0, 1],
      } as Config & { visible_range: [number, number] },
      new Set(),
    );

    expect(getCartesianLayoutAxes(config.layout)).toStrictEqual(
      new Set(["xaxis", "yaxis"]),
    );
  });

  it("preserves supplied layout axes when called without pruning metadata", () => {
    const config = addPostParsingDefaults({
      entities: [entity()],
      layout: axes,
      raw_plotly_config: true,
      visible_range: [0, 1],
    } as Config & { visible_range: [number, number] });
    expect(getCartesianLayoutAxes(config.layout)).toEqual(
      getCartesianLayoutAxes(axes),
    );
    expect(config.config.showSendToCloud).toBe(false);
  });
});
