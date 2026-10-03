import getDeprecationError from "./deprecations";

describe("layout deprecation message", () => {
  it.each([true, false])(
    "links to the replacement once when no_default_layout is %s",
    (value) => {
      const error = getDeprecationError("no_default_layout", value);

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("at [no_default_layout]:");
      expect(error!.message.match(/<a\b/g)).toHaveLength(1);
      expect(error!.message).toContain(
        '<a href="https://github.com/dbuezas/lovelace-plotly-graph-card#raw-plotly-config">raw_plotly_config</a>',
      );
      expect(error!.message).toContain("v3.0.0");
    },
  );

  it("does not warn about raw_plotly_config", () => {
    expect(getDeprecationError("raw_plotly_config", true)).toBeNull();
  });
});
