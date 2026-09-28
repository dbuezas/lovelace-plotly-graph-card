export const HA_THEME_VARIABLES = [
  "card-background-color",
  "primary-background-color",
  "primary-color",
  "primary-text-color",
  "secondary-text-color",
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

export type HATheme = Record<(typeof HA_THEME_VARIABLES)[number], string>;

export function readThemeColors(
  styles: Pick<CSSStyleDeclaration, "getPropertyValue">,
): HATheme {
  return Object.fromEntries(
    HA_THEME_VARIABLES.map((name) => [
      name,
      styles.getPropertyValue(`--${name}`).trim(),
    ]),
  ) as HATheme;
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
      size: 11,
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
