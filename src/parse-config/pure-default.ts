const pureDefaults = new WeakSet<Function>();

/** Only internal defaults may opt into out-of-order, synchronous evaluation. */
export function pureDefault<T extends Function>(fn: T): T {
  pureDefaults.add(fn);
  return fn;
}

export function isPureDefault(value: unknown): value is Function {
  return typeof value === "function" && pureDefaults.has(value);
}
