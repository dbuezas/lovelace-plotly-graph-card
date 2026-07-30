jest.mock("../filters/filters", () => ({}));

import {
  getCartesianLayoutAxes,
  getRememberedConfiguredAxes,
  pruneUnusedCartesianAxes,
} from "./axis-layout";
import { Config, EntityConfig, InputConfig } from "../types";
import {
  addPostParsingDefaults,
  addPreParsingDefaults,
} from "./defaults";

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

function entity(
  xaxis: Plotly.PlotData["xaxis"] = "x",
  yaxis: Plotly.PlotData["yaxis"] = "y"
): EntityConfig {
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
      new Set()
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
      new Set(["xaxis4", "yaxis2"])
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
      new Set()
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
      new Set(["xaxis4"])
    );

    expect(Object.keys(layout)).toStrictEqual([
      "xaxis",
      "xaxis4",
      "yaxis",
      "yaxis3",
      "legend",
    ]);
  });
});

describe("configured axes", () => {
  it("finds cartesian layout keys", () => {
    expect(
      getCartesianLayoutAxes({
        xaxis2: {},
        yaxis4: {},
        legend: {},
      } as Partial<Plotly.Layout>)
    ).toStrictEqual(new Set(["xaxis2", "yaxis4"]));
  });

  it("remembers axes configured directly and through a preset", () => {
    const previousWindow = global.window;
    global.window = {
      PlotlyGraphCardPresets: {
        secondary: {
          layout: { yaxis4: {} },
        } as InputConfig,
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
        {} as Parameters<typeof addPreParsingDefaults>[1]
      );

      expect(getRememberedConfiguredAxes(config)).toStrictEqual(
        new Set(["xaxis2", "yaxis4"])
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
      } as Config & { visible_range: [number, number] }
    );

    expect(getCartesianLayoutAxes(config.layout)).toStrictEqual(
      new Set(["xaxis", "yaxis"])
    );
  });
});
