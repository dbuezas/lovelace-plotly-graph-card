import { merge } from "lodash";
import { Config, InputConfig } from "../types";
import { parseColorScheme } from "./parse-color-scheme";
import { getEntityIndex } from "./parse-config";
import getThemedLayout, { HATheme } from "./themed-layout";
const noop$fn = () => () => {};
const defaultEntityRequired = {
  entity: "",
  show_value: false,
  internal: false,
  time_offset: "0s",
  on_legend_click: noop$fn,
  on_legend_dblclick: noop$fn,
  on_click: noop$fn,
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
    const yaxis_idx = units.indexOf(getFromConfig(`.unit_of_measurement`)) + 1;
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
  layout: {},
  on_dblclick: noop$fn,
  autorange_after_scroll: false,
};

//

const defaultExtraYAxes: Partial<Plotly.LayoutAxis> = {
  // automargin: true, // it makes zooming very jumpy
  side: "right",
  overlaying: "y",
  showgrid: false,
  visible: false,
  // This makes sure that the traces are rendered above the right y axis,
  // including the marker and its text. Useful for show_value. See cliponaxis in entity
  layer: "below traces",
};

const defaultYamlOptional: {
  layout: Partial<Plotly.Layout>;
  config: Partial<Plotly.Config>;
} = {
  config: {
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ["resetScale2d", "toImage", "lasso2d", "select2d"],
    // @ts-expect-error expects a string, not a function
    locale: ({ hass }) => hass.locale?.language,
  },
  layout: {
    height: 285,
    dragmode: "pan",
    xaxis: {
      autorange: false,
      type: "date",
      // automargin: true, // it makes zooming very jumpy
    },
    yaxis: {
      // automargin: true, // it makes zooming very jumpy
    },
    yaxis2: {
      // automargin: true, // it makes zooming very jumpy
      ...defaultExtraYAxes,
      visible: true,
    },
    ...Object.fromEntries(
      Array.from({ length: 27 }).map((_, i) => [
        `yaxis${i + 3}`,
        { ...defaultExtraYAxes },
      ])
    ),
    legend: {
      orientation: "h",
      bgcolor: "transparent",
      x: 0,
      y: 1,
      yanchor: "bottom",
    },
    title: {
      y: 1,
      pad: {
        t: 15,
      },
    },
    modebar: {
      // vertical so it doesn't occlude the legend
      orientation: "v",
    },
    margin: {
      b: 50,
      t: 0,
      l: 60,
      // @ts-expect-error functions are not a plotly thing, only this card
      r: ({ getFromConfig }) => {
        const entities = getFromConfig(`entities`);
        const usesRightAxis = entities.some(({ yaxis }) => yaxis === "y2");
        const usesShowValue = entities.some(({ show_value }) => show_value);
        return usesRightAxis | usesShowValue ? 60 : 30;
      },
    },
  },
};

export function addPreParsingDefaults(
  yaml_in: InputConfig,
  css_vars: HATheme
): InputConfig {
  // merging in two steps to ensure ha_theme and raw_plotly_config took its default value
  let yaml = merge({}, yaml_in, defaultYamlRequired, yaml_in);
  for (let i = 1; i < 31; i++) {
    const yaxis = "yaxis" + (i == 1 ? "" : i);
    yaml.layout[yaxis] = merge(
      {},
      yaml.layout[yaxis],
      yaml.defaults.yaxes,
      yaml.layout[yaxis]
    );
  }

  yaml = merge(
    {},
    yaml,
    {
      layout: yaml.ha_theme ? getThemedLayout(css_vars) : {},
    },
    yaml.raw_plotly_config ? {} : defaultYamlOptional,
    yaml
  );

  yaml.entities = yaml.entities.map((entity) => {
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
      yaml.raw_plotly_config ? {} : defaultEntityOptional,
      yaml.defaults?.entity,
      entity
    );
    return entity;
  });
  return yaml;
}

export function addPostParsingDefaults(
  yaml: Config & { visible_range: [number, number] }
): Config {
  /**
   * These cannot be done via defaults because they depend on the entities already being fully evaluated and filtered
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
