import { parseColorScheme } from "./parse-color-scheme";

export const defaultEntity = {
  entity: "",
  hovertemplate: `<b>%{customdata.name}</b><br><i>%{x}</i><br>%{y}%{customdata.unit_of_measurement}<extra></extra>`,
  mode: "lines",
  show_value: false,
  line: {
    width: 1,
    shape: "hv",
    color: ({ getFromConfig, entityIdx }) => {
      const color_scheme = parseColorScheme(getFromConfig("color_scheme"));
      return color_scheme[entityIdx % color_scheme.length];
    },
  },
  internal: false,
  offset: "0s",
  extend_to_present: ({ getFromConfig, entityIdx }) =>
    !(
      getFromConfig(`entities.${entityIdx}.statistic`) ||
      getFromConfig(`entities.${entityIdx}.period`)
    ),
  unit_of_measurement: ({ data }) => data.meta.unit_of_measurement || "",
  yaxis: ({ getFromConfig, entityIdx }) => {
    const units: string[] = [];
    for (let i = 0; i <= entityIdx; i++) {
      const unit = getFromConfig(`entities.${i}.unit_of_measurement`);
      const internal = getFromConfig(`entities.${i}.internal`);
      if (!internal && !units.includes(unit)) units.push(unit);
    }
    const yaxis_idx = units.length;
    return "y" + (yaxis_idx === 1 ? "" : yaxis_idx);
  },
  name: ({ data, entityIdx, getFromConfig }) => {
    let name =
      data.meta.friendly_name || getFromConfig(`entities.${entityIdx}.entity`);
    const attribute = getFromConfig(`entities.${entityIdx}.attribute`);
    if (attribute) name += ` (${attribute}) `;
    return name;
  },
  customdata: ({ data, entityIdx, getFromConfig }) => {
    const unit_of_measurement = getFromConfig(
      `entities.${entityIdx}.unit_of_measurement`
    );
    const name = getFromConfig(`entities.${entityIdx}.name`);
    return data.xs.map((x, i) => ({
      unit_of_measurement,
      name,
    }));
  },
};
export const defaultYaml = {
  title: "",
  hours_to_show: 1,
  refresh_interval: "auto",
  color_scheme: "category10",
  offset: "0s",
  no_theme: false,
  no_default_layout: false,
  significant_changes_only: false,
  minimal_response: true,
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
        return usesRightAxis ? 60 : 30;
      },
    },
  },
};
