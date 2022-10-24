import { subtractRanges } from "./date-ranges";
describe("data-ranges", () => {
  it("Should subtract left ", () => {
    const result = subtractRanges([[0, 10]], [[0, 5]]);
    expect(result).toEqual([[6, 10]]);
  });
  it("Should subtract right ", () => {
    const result = subtractRanges([[0, 10]], [[5, 10]]);
    expect(result).toEqual([[0, 4]]);
  });
  it("Should subtract middle ", () => {
    const result = subtractRanges([[0, 10]], [[3, 7]]);
    expect(result).toEqual([
      [0, 2],
      [8, 10],
    ]);
  });
  it("Should handle almost empty", () => {
    const result = subtractRanges([[0, 10]], [[1, 10]]);
    expect(result).toEqual([[0, 0]]);
  });
  it("Should handle equl subraction", () => {
    const result = subtractRanges([[0, 10]], [[0, 10]]);
    expect(result).toEqual([]);
  });
  it("Should handle empty singleton range", () => {
    const result = subtractRanges([[0, 10]], [[1, 9]]);
    expect(result).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });
});
