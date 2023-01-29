import { parseTimeDuration } from "../duration/duration";

export default function getDeprecationError(path: string, value: any) {
  const e = _getDeprecationError(path, value);
  if (e) return new Error(`at [${path}]: ${e}`);
  return null;
}
function _getDeprecationError(path: string, value: any) {
  if (path.match(/^no_theme$/))
    return "renamed to ha_theme (inverted logic) in v3.0.0";
  if (path.match(/^no_default_layout$/))
    return "replaced with more general raw_plotly_config in v3.0.0";
  if (path.match(/^offset$/)) return "renamed to time_offset in v3.0.0";
  if (path.match(/^entities\.\d+\.offset$/)) {
    try {
      parseTimeDuration(value);
      return 'renamed to time_offset in v3.0.0 to avoid conflicts with <a href="https://plotly.com/javascript/reference/bar/#bar-offset">bar-offsets</a>';
    } catch (e) {
      // bar-offsets are numbers without time unit
    }
  }
  if (path.match(/^entities\.\d+\.lambda$/))
    return "removed in v3.0.0, use filters instead";
  if (path.match(/^significant_changes_only$/))
    return "removed in v3.0.0, it is now always set to false";
  if (path.match(/^minimal_response$/))
    return "removed in v3.0.0, if you need attributes use the 'attribute' parameter instead.";
  return null;
}
