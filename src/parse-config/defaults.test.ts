import { addPostParsingDefaults } from "./defaults";
import { Config } from "../types";

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
