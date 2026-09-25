import {
  DEFAULT_PLOT_HEIGHT,
  finishInitialLoading,
  getInitialPlotHeight,
  setInitialLoadingHeight,
} from "./loading-state";

describe("getInitialPlotHeight", () => {
  it("uses the same height as the default Plotly layout", () => {
    expect(getInitialPlotHeight(undefined)).toBe(DEFAULT_PLOT_HEIGHT);
  });

  it("reserves a configured layout height while loading", () => {
    expect(getInitialPlotHeight({ height: 420 })).toBe(420);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back for invalid height %s",
    (height) => {
      expect(getInitialPlotHeight({ height })).toBe(DEFAULT_PLOT_HEIGHT);
    },
  );
});

describe("initial loading state", () => {
  it("sets the reserved height on the card", () => {
    const setProperty = jest.fn();
    const card = { style: { setProperty } } as unknown as HTMLElement;

    setInitialLoadingHeight(card, { height: 420 });

    expect(setProperty).toHaveBeenCalledWith(
      "--plotly-loading-height",
      "420px",
    );
  });

  it("removes the loader and accessibility busy state", () => {
    const remove = jest.fn();
    const setCardAttribute = jest.fn();
    const setIndicatorAttribute = jest.fn();
    const card = {
      classList: { remove },
      setAttribute: setCardAttribute,
    } as unknown as HTMLElement;
    const indicator = {
      setAttribute: setIndicatorAttribute,
    } as unknown as HTMLElement;

    finishInitialLoading(card, indicator);

    expect(remove).toHaveBeenCalledWith("loading");
    expect(setCardAttribute).toHaveBeenCalledWith("aria-busy", "false");
    expect(setIndicatorAttribute).toHaveBeenCalledWith("aria-hidden", "true");
  });
});
