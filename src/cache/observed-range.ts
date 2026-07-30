export function updateObservedRange(
  observedRange: [number, number],
  visibleRange: [number, number],
  preserveObservedRange: boolean,
): [number, number] {
  if (!preserveObservedRange) return visibleRange.slice() as [number, number];
  return [
    Math.min(observedRange[0], visibleRange[0]),
    Math.max(observedRange[1], visibleRange[1]),
  ];
}
