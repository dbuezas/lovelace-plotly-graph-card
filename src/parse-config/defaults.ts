import { parseColorScheme } from "./parse-color-scheme";
import { getEntityIndex } from "./parse-config";

export const defaultEntity = {
  entity: "",

  mode: "lines",
  show_value: false,
  line: {
    width: 1,
    shape: "hv",
    color: ({ getFromConfig, path }) => {
      const color_scheme = parseColorScheme(getFromConfig("color_scheme"));
      return color_scheme[getEntityIndex(path) % color_scheme.length];
    },
  },
  internal: false,
  time_offset: "0s",
  // extend_to_present: true unless using statistics. Defined inside parse-config.ts to avoid forward depndency
  unit_of_measurement: ({ meta }) => meta.unit_of_measurement || "",
  name: ({ meta, getFromConfig }) => {
    let name = meta.friendly_name || getFromConfig(`.entity`);
    const attribute = getFromConfig(`.attribute`);
    if (attribute) name += ` (${attribute}) `;
    return name;
  },
  hovertemplate: ({ getFromConfig }) =>
    `<b>${getFromConfig(".name")}</b><br><i>%{x}</i><br>%{y} ${getFromConfig(
      ".unit_of_measurement"
    )}<extra></extra>`,
  yaxis: ({ getFromConfig, path }) => {
    const units: string[] = [];
    for (let i = 0; i <= getEntityIndex(path); i++) {
      const unit = getFromConfig(`entities.${i}.unit_of_measurement`);
      const internal = getFromConfig(`entities.${i}.internal`);
      if (!internal && !units.includes(unit)) units.push(unit);
    }
    const yaxis_idx = units.length;
    return "y" + (yaxis_idx === 1 ? "" : yaxis_idx);
  },
};
export const defaultYaml = {
  title: "",
  hours_to_show: 1,
  refresh_interval: "auto",
  color_scheme: "category10",
  time_offset: "0s",
  no_theme: false,
  no_default_layout: false,
  disable_pinch_to_zoom: false,
  defaults: {
    entity: {},
    yaxes: {},
  },
  config: {
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ["resetScale2d", "toImage", "lasso2d", "select2d"],
  },
  layout: {
    xaxis: { autorange: false },
    margin: {
      r: ({ getFromConfig }) => {
        const entities = getFromConfig(`entities`);
        const usesRightAxis = entities.some(({ yaxis }) => yaxis === "y2");
        const usesShowValue = entities.some(({ show_value }) => show_value);
        return usesRightAxis | usesShowValue ? 60 : 30;
      },
    },
  },
};
