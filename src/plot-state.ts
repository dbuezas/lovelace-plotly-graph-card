type TraceVisibility = boolean | "legendonly";

export function getFetchMask(
  data: { visible?: TraceVisibility }[] | undefined,
  shouldFetch: boolean
): boolean[] {
  return (data || []).map(
    ({ visible }) => shouldFetch && visible !== "legendonly"
  );
}
