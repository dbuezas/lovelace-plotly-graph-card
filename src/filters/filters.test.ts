import filters, { removeMissing } from "./filters";
const data = {
  xs: [
    "2022-12-20T18:07:28.910Z",
    "2022-12-20T18:07:29.815Z",
    "2022-12-20T18:07:30.076Z",
    "2022-12-20T18:07:34.995Z",
    "2022-12-20T18:07:35.220Z",
    "2022-12-20T18:07:35.306Z",
    "2022-12-20T18:07:35.982Z",
    "2022-12-20T18:07:36.109Z",
    "2022-12-20T18:07:37.590Z",
    "2022-12-20T18:07:38.590Z",
  ],
  ys: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
};
const cleanData = removeMissing(data.ys, data.xs);
describe("filters", () => {
  it("offset -1", () => {
    expect(filters.offset(-1)([1, 2, 3])).toEqual([0, 1, 2]);
  });
  it("multiply * 2", () => {
    expect(filters.multiply(2)([1, 2, 3])).toEqual([2, 4, 6]);
  });
  it("calibrate", () => {
    expect(filters.calibrate_linear({ 1: 11, 2: 21 })([1, 2, 3])).toEqual([
      11, 21, 31,
    ]);
  });
  it("accumulate", () => {
    expect(filters.accumulate()([1, 2, 3])).toMatchInlineSnapshot(`6`);
  });
  it("derivate", () => {
    expect(
      filters.derivate("s")(
        [1, 2, 0],
        [
          "2022-12-20T18:07:28.000Z",
          "2022-12-20T18:07:29.000Z",
          "2022-12-20T18:07:30.000Z",
        ].map((x) => new Date(x)),
        { unit_of_measurement: "m" }
      )
    ).toEqual({
      unit_of_measurement: "m/s",
      x: [1671559649000, 1671559650000],
      y: [1, -2],
    });
  });
});

// offset: (val: number) => (ys: number[]) => ys.map((y) => y + val),
// multiply: (val: number) => (ys: number[]) => ys.map((y) => y * val),
// calibrate_linear: (obj: Record<number, number>) => (ys: number[]) => {
// accumulate: () => (ys: number[]) => ys.reduce((acc, y) => y + acc, 0),
// derivate: (unit: keyof typeof timeUnits = "h") =>
// integrate: (unit: keyof typeof timeUnits = "h") =>
// sliding_window_moving_average:
// math: (fnStr: string) => {
// fn: (fnStr: string) => window.eval(fnStr),
