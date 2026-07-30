import { getResizeLayoutUpdate } from "./card-size";

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
