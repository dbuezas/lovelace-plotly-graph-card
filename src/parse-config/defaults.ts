import { merge } from "lodash";
import { Config, InputConfig } from "../types";
import { parseColorScheme } from "./parse-color-scheme";
import { getEntityIndex } from "./parse-config";
import getThemedLayout, { defaultLayout, HATheme } from "./themed-layout";

const defaultEntityRequired = {
  entity: "",
  show_value: false,
  internal: false,
  time_offset: "0s",
};
const defaultEntityOptional = {
  mode: "lines",
  line: {
    width: 1,
    shape: "hv",
    color: ({ getFromConfig, path }) => {
      const color_scheme = parseColorScheme(getFromConfig("color_scheme"));
      return color_scheme[getEntityIndex(path) % color_scheme.length];
    },
  },
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

const defaultYamlRequired = {
  title: "",
  hours_to_show: 1,
  refresh_interval: "auto",
  color_scheme: "category10",
  time_offset: "0s",
  raw_plotly_config: false,
  ha_theme: true,
  disable_pinch_to_zoom: false,
  raw_plotly: false,
  defaults: {
    entity: {},
    yaxes: {},
  },
};
const defaultYamlOptional = {
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

export function addPreParsingDefaults(yaml: InputConfig): InputConfig {
  const out = merge(
    {},
    yaml,
    { layout: {} },
    defaultYamlRequired,
    yaml.raw_plotly_config ? {} : defaultYamlOptional,
    yaml
  );
  for (let i = 1; i < 31; i++) {
    const yaxis = "yaxis" + (i == 1 ? "" : i);
    out.layout[yaxis] = merge(
      {},
      out.layout[yaxis],
      out.defaults?.yaxes,
      out.layout[yaxis]
    );
  }
  out.entities = out.entities.map((entity) => {
    if (typeof entity === "string") entity = { entity };
    entity.entity ??= "";
    const [oldAPI_entity, oldAPI_attribute] = entity.entity.split("::");
    if (oldAPI_attribute) {
      entity.entity = oldAPI_entity;
      entity.attribute = oldAPI_attribute;
    }
    entity = merge(
      {},
      entity,
      defaultEntityRequired,
      out.raw_plotly_config ? {} : defaultEntityOptional,
      out.defaults?.entity,
      entity
    );
    return entity;
  });
  return out;
}

export function addPostParsingDefaults({
  yaml,
  css_vars,
}: {
  yaml: Config;
  css_vars: HATheme;
}): Config {
  // 3rd pass: decorate
  /**
   * These cannot be done via defaults because they are functions and
   * functions would be overwritten if the user sets a configuration on a parent
   *  */
  const yAxisTitles = Object.fromEntries(
    yaml.entities.map(({ unit_of_measurement, yaxis }) => [
      "yaxis" + yaxis?.slice(1),
      { title: unit_of_measurement },
    ])
  );
  const layout = merge(
    {},
    yaml.layout,
    yaml.raw_plotly_config ? {} : defaultLayout,
    yaml.ha_theme ? getThemedLayout(css_vars) : {},
    yaml.raw_plotly_config
      ? {}
      : {
          xaxis: {
            range: yaml.visible_range,
          },
        },
    yaml.raw_plotly_config ? {} : yAxisTitles,
    yaml.layout
  );
  return merge({}, yaml, { layout }, yaml);
}
