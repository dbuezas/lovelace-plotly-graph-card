import { getResizeLayoutUpdate, hasDynamicSizeConfig } from "./card-size";

describe("getResizeLayoutUpdate", () => {
  it("updates only a changed width", () => {
    expect(getResizeLayoutUpdate({ width: 400 }, { width: 600 })).toStrictEqual(
      {
        width: 600,
      },
    );
  });

  it("updates width and height in panel mode", () => {
    expect(
      getResizeLayoutUpdate(
        { width: 400, height: 300 },
        { width: 600, height: 450 },
      ),
    ).toStrictEqual({
      width: 600,
      height: 450,
    });
  });

  it("does nothing when the size is unchanged", () => {
    expect(
      getResizeLayoutUpdate(
        { width: 600, height: 450 },
        { width: 600, height: 450 },
      ),
    ).toStrictEqual({});
  });

  it("requests a full render when an automatic dimension is removed", () => {
    expect(
      getResizeLayoutUpdate({ width: 600, height: 450 }, { width: 600 }),
    ).toBeNull();
  });

  it("does not override explicitly configured dimensions", () => {
    expect(
      getResizeLayoutUpdate(
        { width: 400, height: 300 },
        { width: 600, height: 450 },
        { width: 800, height: 500 },
      ),
    ).toStrictEqual({});
  });

  it("still updates dimensions that are not explicitly configured", () => {
    expect(
      getResizeLayoutUpdate(
        { width: 400, height: 300 },
        { width: 600, height: 450 },
        { height: 500 },
      ),
    ).toStrictEqual({ width: 600 });
  });

  it("does not re-render when a configured height replaces panel sizing", () => {
    expect(
      getResizeLayoutUpdate(
        { width: 600, height: 450 },
        { width: 600 },
        { height: 500 },
      ),
    ).toStrictEqual({});
  });
});

describe("hasDynamicSizeConfig", () => {
  it.each([
    { layout: { height: "$ex get('layout.width') / 2" } },
    { entities: [{ y: "$fn ({ get }) => [get('layout.width')]" }] },
    { layout: { width: () => 400 } },
    { entities: [{ filters: [{ fn: "({ ys }) => ({ ys })" }] }] },
    { entities: [{ filters: [{ map_y: "y * 2" }] }] },
    { entities: [{ filters: [{ map_x: "x" }] }] },
    { entities: [{ filters: [{ map_y_numbers: "y" }] }] },
    { entities: [{ filters: [{ filter: "y > 0" }] }] },
  ])("preserves full rendering for executable configuration: %j", (config) => {
    expect(hasDynamicSizeConfig(config)).toBe(true);
  });

  it("keeps the fast path for normal data, layouts and built-in filters", () => {
    expect(
      hasDynamicSizeConfig({
        title: "Static chart",
        layout: { height: 285 },
        entities: [
          { y: [1, null, 3], filters: [{ multiply: 2 }, "force_numeric"] },
        ],
      }),
    ).toBe(false);
  });

  it("handles an absent layout", () => {
    expect(hasDynamicSizeConfig(undefined)).toBe(false);
  });
});
