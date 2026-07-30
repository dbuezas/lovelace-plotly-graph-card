import { getFetchMask } from "./plot-state";

describe("getFetchMask", () => {
  it("supports the initial render before Plotly has created data", () => {
    expect(getFetchMask(undefined, true)).toStrictEqual([]);
  });

  it("does not fetch traces hidden through the legend", () => {
    expect(
      getFetchMask(
        [{ visible: true }, { visible: "legendonly" }, {}],
        true
      )
    ).toStrictEqual([true, false, true]);
  });

  it("does not fetch any trace for a render-only update", () => {
    expect(getFetchMask([{ visible: true }, {}], false)).toStrictEqual([
      false,
      false,
    ]);
  });
});
