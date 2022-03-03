import merge from "lodash/merge";
import { HATheme } from "./types";

const defaultLayout: Partial<Plotly.Layout> = {
  height: 285,
  dragmode: "pan",
  yaxis2: {
    side: "right",
    overlaying: "y",
    showgrid: false,
  },
  yaxis3: {
    side: "right",
    overlaying: "y",
    visible: false,
  },
  yaxis4: {
    side: "right",
    overlaying: "y",
    visible: false,
  },
  yaxis5: {
    side: "right",
    overlaying: "y",
    visible: false,
  },
  margin: {
    b: 50,
    t: 30,
    l: 60,
    r: 20,
  },
  legend: {
    orientation: "h",
    // xanchor: "left",
    bgcolor: "transparent",
    x: 0,
    y: 1.2,
  },
  ...{
    // modebar is missing from the Layout Typings
    // vertical so it doesn't occlude the legend
    modebar: {
      orientation: "v",
    },
  },
};

const themeAxisStyle = {
  tickcolor: "rgba(127,127,127,.3)",
  gridcolor: "rgba(127,127,127,.3)",
  linecolor: "rgba(127,127,127,.3)",
  zerolinecolor: "rgba(127,127,127,.3)",
  // automargin: true,
};

export default function getThemedLayout(
  haTheme: HATheme,
  no_theme?: boolean,
  no_default_layout?: boolean
): Partial<Plotly.Layout> {
  const theme = {
    paper_bgcolor: haTheme["--card-background-color"],
    plot_bgcolor: haTheme["--card-background-color"],
    font: {
      color: haTheme["--secondary-text-color"],
      size: 11,
    },
    xaxis: { ...themeAxisStyle },
    yaxis: { ...themeAxisStyle },
    yaxis2: { ...themeAxisStyle },
    yaxis3: { ...themeAxisStyle },
    yaxis4: { ...themeAxisStyle },
    yaxis5: { ...themeAxisStyle },
    yaxis6: { ...themeAxisStyle },
    yaxis7: { ...themeAxisStyle },
    yaxis8: { ...themeAxisStyle },
    yaxis9: { ...themeAxisStyle },
  };

  return merge(
    { layout: { legend: { traceorder: "normal" } } },
    no_theme ? {} : theme,
    no_default_layout ? {} : defaultLayout
  );
}
