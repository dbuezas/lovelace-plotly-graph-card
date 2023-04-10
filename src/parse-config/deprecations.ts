import { parseTimeDuration } from "../duration/duration";

export default function getDeprecationError(path: string, value: any) {
  const e = _getDeprecationError(path, value);
  if (e) return new Error(`at [${path}]: ${e}`);
  return null;
}
function _getDeprecationError(path: string, value: any) {
  if (path.match(/^no_theme$/))
    return `renamed to <a href="https://github.com/dbuezas/lovelace-plotly-graph-card#home-assistant-theming">ha_theme</a> (inverted logic) in v3.0.0`;
  if (path.match(/^no_default_layout$/))
    return `replaced with more general <a href="https://github.com/dbuezas/lovelace-plotly-graph-card#raw-plotly-config">raw-plotly-config</a> in v3.0.0. See <a href="https://github.com/dbuezas/lovelace-plotly-graph-card#no_default_layout">layout migration guide</a>.`;
  if (path.match(/^offset$/)) return "renamed to time_offset in v3.0.0";
  if (path.match(/^entities\.\d+\.offset$/)) {
    try {
      parseTimeDuration(value);
      return 'renamed to time_offset in v3.0.0 to avoid conflicts with <a href="https://plotly.com/javascript/reference/bar/#bar-offset">bar-offsets</a>.';
    } catch (e) {
      // bar-offsets are numbers without time unit
    }
  }
  if (path.match(/^entities\.\d+\.lambda$/))
    return `removed in v3.0.0, use <a href="https://github.com/dbuezas/lovelace-plotly-graph-card#filters">filters</a> instead. See <a href="https://github.com/dbuezas/lovelace-plotly-graph-card#lambda">lambda migration guide</a>.`;
  if (path.match(/^entities\.\d+\.show_value\.right_margin$/))
    return "removed in v3.0.0, use `true` and set the global `time_offset` or `layout.margins.r` to make space at the right. ";
  if (path.match(/^significant_changes_only$/))
    return "removed in v3.0.0, it is now always set to false";
  if (path.match(/^minimal_response$/))
    return "removed in v3.0.0, if you need attributes use the 'attribute' parameter instead.";
  return null;
}
