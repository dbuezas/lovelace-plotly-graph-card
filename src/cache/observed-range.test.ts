import { updateObservedRange } from "./observed-range";

describe("updateObservedRange", () => {
  it("tracks only the current rolling window during automatic refreshes", () => {
    expect(updateObservedRange([0, 100], [10, 110], false)).toEqual([10, 110]);
  });

  it("preserves ranges visited while browsing", () => {
    expect(updateObservedRange([10, 110], [-50, 40], true)).toEqual([-50, 110]);
    expect(updateObservedRange([-50, 110], [100, 200], true)).toEqual([
      -50, 200,
    ]);
  });
});
