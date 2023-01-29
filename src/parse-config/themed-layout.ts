export type HATheme = {
  "card-background-color": string;
  "primary-background-color": string;
  "primary-color": string;
  "primary-text-color": string;
  "secondary-text-color": string;
};

const themeAxisStyle = {
  tickcolor: "rgba(127,127,127,.3)",
  gridcolor: "rgba(127,127,127,.3)",
  linecolor: "rgba(127,127,127,.3)",
  zerolinecolor: "rgba(127,127,127,.3)",
};

export default function getThemedLayout(
  haTheme: HATheme
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
      ])
    ),
  };
}
