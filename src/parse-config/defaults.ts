import merge from "lodash/merge";
import { HomeAssistant } from "custom-card-helpers";
import { computeEntityName } from "../entity-name";
import { Config, InputConfig } from "../types";
import { parseColorScheme } from "./parse-color-scheme";
import { getEntityIndex } from "./parse-config";
import getThemedLayout, { HATheme } from "./themed-layout";
import { DEFAULT_PLOT_HEIGHT } from "../loading-state";
declare const window: Window & { PlotlyGraphCardPresets?: Record<string, InputConfig> };
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
  name: ({ hass, meta, getFromConfig }) => {
    const entityId = getFromConfig(`.entity`);
    const stateObj = hass?.states[entityId];
    // A filter (trendline, or any fn) renames its trace by rewriting
    // meta.friendly_name. Comparing it with the entity's own attribute is the
    // only way to tell such a rename apart, and it has to win over the registry.
    const renamedByFilter =
      meta.friendly_name &&
      meta.friendly_name !== stateObj?.attributes?.friendly_name
        ? meta.friendly_name
        : undefined;
    let name =
      renamedByFilter ??
      computeEntityName(hass, stateObj, undefined) ??
      meta.friendly_name ??
      entityId;
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
    xaxes: {},
    yaxes: {},
  },
  layout: {},
  on_dblclick: noop$fn,
  autorange_after_scroll: false,
};

//

const defaultExtraXAxes: Partial<Plotly.LayoutAxis> = {
  // automargin: true, // it makes zooming very jumpy
  type: "date",
  autorange: false,
  overlaying: "x",
  showgrid: false,
  visible: false,
};

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
    height: DEFAULT_PLOT_HEIGHT,
    dragmode: "pan",
    xaxis: {
      autorange: false,
      type: "date",
      // automargin: true, // it makes zooming very jumpy
    },
    ...Object.fromEntries(
      Array.from({ length: 28 }).map((_, i) => [
        `xaxis${i + 2}`,
        { ...defaultExtraXAxes },
      ])
    ),
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
    },
  },
};

function getPresetYaml(presets: string | string[] | undefined, skips?: Set<string>): Partial<InputConfig> {
  if (!window.PlotlyGraphCardPresets || presets === undefined) return {};
  if (!Array.isArray(presets)) presets = [presets];
  if (presets.length == 0) return {};
  if (skips === undefined) skips = new Set<string>();
  const nestedPresets: string[] = [];
  const presetYamls = presets.map((preset) => {
    const yaml = window.PlotlyGraphCardPresets![preset] ?? {};
    if (yaml.preset !== undefined) {
      if (!Array.isArray(yaml.preset)) yaml.preset = [yaml.preset];
      nestedPresets.push(...yaml.preset);
    }
    return yaml;
  });
  const newPresets = nestedPresets.filter((preset) => !skips.has(preset));
  const nestedYaml = getPresetYaml(newPresets, new Set([...skips, ...presets]));
  return merge({}, ...presetYamls, nestedYaml);
}

export function addPreParsingDefaults(
  yaml_in: InputConfig,
  css_vars: HATheme,
  hass?: HomeAssistant
): InputConfig {
  // merging in two steps to ensure ha_theme and raw_plotly_config took its default value
  let yaml = merge({}, yaml_in, defaultYamlRequired, yaml_in);
  const preset = getPresetYaml(yaml.preset);
  for (let i = 1; i < 31; i++) {
    for (const d of ["x", "y"]) {
      const axis = d + "axis" + (i == 1 ? "" : i);
      yaml.layout[axis] = merge(
        {},
        yaml.layout[axis],
        yaml.defaults[d + "axes"],
        preset.defaults?.[d+ "axes"] ?? {},
        yaml.layout[axis]
      );
    }
  }
  yaml = merge(
    {},
    yaml,
    {
      layout: yaml.ha_theme ? getThemedLayout(css_vars) : {},
    },
    yaml.raw_plotly_config ? {} : defaultYamlOptional,
    preset,
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
    // An empty name has always meant "use Home Assistant's name"
    if (entity.name === "") delete entity.name;
    const entityName = entity.name;
    const entityFilters = entity.filters;
    entity = merge(
      {},
      entity,
      defaultEntityRequired,
      yaml.raw_plotly_config ? {} : defaultEntityOptional,
      yaml.defaults?.entity,
      entity
    );
    // An entity's name list replaces the default one instead of being merged by index
    if (entityName !== undefined) entity.name = entityName;
    // A structured name has to become a string: the parser walks anything
    // object-shaped as config. After merging, so defaults.entity and presets
    // count too.
    if (entity.name && typeof entity.name === "object") {
      const id = entity.entity ?? "";
      entity.name = computeEntityName(hass, hass?.states[id], entity.name) ?? id;
    }
    // Entity filters replace defaults.entity.filters instead of being merged by index
    if (entityFilters !== undefined)
      entity.filters = Array.isArray(entityFilters)
        ? merge([], entityFilters)
        : entityFilters;
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
    yaml.entities.flatMap((entity) =>
      "yaxis" in entity && entity.yaxis
        ? [[
            "yaxis" + entity.yaxis.slice(1),
            { title: { text: entity.unit_of_measurement } },
          ]]
        : []
    )
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
          margin: {
            r: yaml.entities.some(
              (entity) =>
                ("yaxis" in entity && entity.yaxis === "y2") ||
                entity.show_value,
            )
              ? 60
              : 30,
          },
        },
    yaml.raw_plotly_config ? {} : yAxisTitles,
    yaml.layout
  );
  const templateAxis =
    typeof layout.template === "object" && layout.template !== null
      ? layout.template.layout?.yaxis
      : undefined;
  if (
    yaml.logarithmic_scale === true &&
    layout.yaxis?.type === undefined &&
    templateAxis?.type === undefined
  ) {
    layout.yaxis = {
      ...layout.yaxis,
      type: "log",
    };
  }
  const axisType = layout.yaxis?.type ?? templateAxis?.type;
  const validBound = (value: number | undefined): value is number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    (axisType !== "log" || value > 0);
  const minimum = validBound(yaml.min_y_axis) ? yaml.min_y_axis : null;
  const maximum = validBound(yaml.max_y_axis) ? yaml.max_y_axis : null;
  const orderedBounds =
    minimum === null || maximum === null || minimum <= maximum;
  let editor_y_axis: Config["editor_y_axis"];
  if (
    (minimum !== null || maximum !== null) &&
    orderedBounds &&
    (!yaml.autorange_after_scroll || yaml.fit_y_data) &&
    (axisType === undefined || axisType === "linear" || axisType === "log") &&
    layout.yaxis?.range === undefined &&
    layout.yaxis?.autorange === undefined &&
    layout.yaxis?.autorangeoptions === undefined &&
    templateAxis?.range === undefined &&
    templateAxis?.autorange === undefined &&
    templateAxis?.autorangeoptions === undefined
  ) {
    const bounds = [minimum, maximum];
    const include = bounds.filter((value): value is number => value !== null);
    const rangeBound = (value: number | null) =>
      value !== null && axisType === "log" ? Math.log10(value) : value;
    const range: [number | null, number | null] = [
      rangeBound(minimum),
      rangeBound(maximum),
    ];
    if (yaml.fit_y_data && axisType === "log") {
      editor_y_axis = { log_fit_bounds: [minimum, maximum] };
    } else if (!yaml.fit_y_data && (minimum === null || maximum === null)) {
      editor_y_axis = { partial_bound: true };
    }
    layout.yaxis = {
      ...layout.yaxis,
      ...(yaml.fit_y_data
        ? {
            autorange: true,
            ...(axisType !== "log" ? { autorangeoptions: { include } } : {}),
          }
        : { range }),
    };
  }
  return {
    ...yaml,
    layout,
    editor_y_axis,
    config: {
      // Keep dashboard data local unless the user explicitly enables upload.
      showSendToCloud: false,
      doubleClickDelay: 300,
      ...yaml.config,
    },
  };
}

export function getEditorYAxisRelayout(
  yaml: Config,
  range: readonly unknown[] | undefined,
): (Partial<Plotly.Layout> & {
  "yaxis.range": [number | null, number | null];
  "yaxis.autorange": boolean;
}) | undefined {
  if (!range || range.length !== 2) return;
  const [minimum, maximum] = range;
  if (
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum)
  ) {
    return;
  }

  if (yaml.editor_y_axis?.partial_bound && minimum >= maximum) {
    // A partial editor bound outside the data must not reverse the axis.
    return { "yaxis.range": [null, null], "yaxis.autorange": true };
  }
  const bounds = yaml.editor_y_axis?.log_fit_bounds;
  if (bounds) {
    // Plotly's include option does not reliably extend logarithmic ranges.
    // Expand its calculated range instead of duplicating its data/visibility logic.
    const lower =
      bounds[0] === null ? minimum : Math.min(minimum, Math.log10(bounds[0]));
    const upper =
      bounds[1] === null ? maximum : Math.max(maximum, Math.log10(bounds[1]));
    if (lower < minimum || upper > maximum) {
      return { "yaxis.range": [lower, upper], "yaxis.autorange": false };
    }
  }
  return undefined;
}
