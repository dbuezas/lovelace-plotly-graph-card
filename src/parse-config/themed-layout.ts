export const HA_THEME_VARIABLES = [
  "card-background-color",
  "primary-background-color",
  "primary-color",
  "primary-text-color",
  "secondary-text-color",
  "accent-color",
  "error-color",
  "warning-color",
  "success-color",
  "info-color",
  "divider-color",
  "disabled-color",
  "red-color",
  "pink-color",
  "purple-color",
  "deep-purple-color",
  "indigo-color",
  "blue-color",
  "light-blue-color",
  "cyan-color",
  "teal-color",
  "green-color",
  "light-green-color",
  "lime-color",
  "yellow-color",
  "amber-color",
  "orange-color",
  "deep-orange-color",
  "brown-color",
  "light-grey-color",
  "grey-color",
  "dark-grey-color",
  "blue-grey-color",
  "black-color",
  "white-color",
] as const;

type HAThemeColors = Record<(typeof HA_THEME_VARIABLES)[number], string>;

export type HATheme = HAThemeColors & {
  // Resolved from Home Assistant's typography CSS variables (see getCSSVars)
  "font-family": string;
  "font-size": string;
  "font-weight": string;
};

export function readThemeColors(
  styles: Pick<CSSStyleDeclaration, "getPropertyValue">,
): HAThemeColors {
  return Object.fromEntries(
    HA_THEME_VARIABLES.map((name) => [
      name,
      styles.getPropertyValue(`--${name}`).trim(),
    ]),
  ) as HAThemeColors;
}

const themeAxisStyle = {
  tickcolor: "rgba(127,127,127,.3)",
  gridcolor: "rgba(127,127,127,.3)",
  linecolor: "rgba(127,127,127,.3)",
  zerolinecolor: "rgba(127,127,127,.3)",
};

export default function getThemedLayout(
  haTheme: HATheme,
): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: haTheme["card-background-color"],
    plot_bgcolor: haTheme["card-background-color"],
    font: {
      color: haTheme["secondary-text-color"],
      family: haTheme["font-family"] || undefined,
      size: parseFloat(haTheme["font-size"]) || 12,
      weight: parseInt(haTheme["font-weight"]) || undefined,
    },
    xaxis: { ...themeAxisStyle },
    yaxis: { ...themeAxisStyle },
    ...Object.fromEntries(
      Array.from({ length: 28 }).map((_, i) => [
        `yaxis${i + 2}`,
        { ...themeAxisStyle },
      ]),
    ),
  };
}
