import { InputConfig } from "../types";

function needsFullStatistics(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (typeof value === "string") {
    return value.startsWith("$fn") || value.startsWith("$ex");
  }
  if (Array.isArray(value)) return value.some(needsFullStatistics);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, child]) =>
        key === "preset" ||
        (key === "filters" && Array.isArray(child) && child.length > 0) ||
        needsFullStatistics(child),
    );
  }
  return false;
}

export function canSelectStatisticsTypes(input: InputConfig): boolean {
  // Statistics are exposed only while traversing an entity, not layout/range
  // expressions. Inspect user input: built-in defaults also contain functions.
  return (
    input.preset === undefined &&
    !needsFullStatistics(input.entities) &&
    !needsFullStatistics(input.defaults?.entity)
  );
}
