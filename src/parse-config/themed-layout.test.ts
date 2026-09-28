import getThemedLayout, {
  HA_THEME_VARIABLES,
  readThemeColors,
} from "./themed-layout";

describe("Home Assistant theme colors", () => {
  it("reads every supported color from CSS rather than hardcoded defaults", () => {
    const getPropertyValue = jest.fn((name: string) => `  ${name}-value  `);
    const colors = readThemeColors({ getPropertyValue });
    expect(HA_THEME_VARIABLES).toHaveLength(29);
    expect(new Set(HA_THEME_VARIABLES).size).toBe(29);
    for (const name of HA_THEME_VARIABLES) {
      expect(getPropertyValue).toHaveBeenCalledWith(`--${name}`);
      expect(colors[name]).toBe(`--${name}-value`);
    }
  });

  it("keeps unset CSS variables empty", () => {
    const colors = readThemeColors({ getPropertyValue: () => "" });
    expect(Object.values(colors).every((color) => color === "")).toBe(true);
  });

  it("reads changed theme values on the next call", () => {
    let blue = "#123456";
    const styles = {
      getPropertyValue: (name: string) => (name === "--blue-color" ? blue : ""),
    };
    const first = readThemeColors(styles);
    blue = "#abcdef";
    expect(readThemeColors(styles)["blue-color"]).toBe("#abcdef");
    expect(first["blue-color"]).toBe("#123456");
  });

  it("preserves the existing themed layout without changing trace colors", () => {
    const values: Record<string, string> = {
      "--card-background-color": "#222222",
      "--secondary-text-color": "#eeeeee",
      "--blue-color": "#123456",
    };
    const layout = getThemedLayout(
      readThemeColors({
        getPropertyValue: (name) => values[name] || "",
      }),
    );
    expect(layout.paper_bgcolor).toBe("#222222");
    expect(layout.plot_bgcolor).toBe("#222222");
    expect(layout.font?.color).toBe("#eeeeee");
    expect(layout.colorway).toBeUndefined();
  });
});
