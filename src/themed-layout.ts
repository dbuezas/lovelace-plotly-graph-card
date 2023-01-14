import merge from "lodash/merge";
import { HATheme } from "./types";

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

const defaultLayout: Partial<Plotly.Layout> = {
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
  yaxis3: { ...defaultExtraYAxes },
  yaxis4: { ...defaultExtraYAxes },
  yaxis5: { ...defaultExtraYAxes },
  yaxis6: { ...defaultExtraYAxes },
  yaxis7: { ...defaultExtraYAxes },
  yaxis8: { ...defaultExtraYAxes },
  yaxis9: { ...defaultExtraYAxes },
  // @ts-expect-error (the types are missing yaxes > 9)
  yaxis10: { ...defaultExtraYAxes },
  yaxis11: { ...defaultExtraYAxes },
  yaxis12: { ...defaultExtraYAxes },
  yaxis13: { ...defaultExtraYAxes },
  yaxis14: { ...defaultExtraYAxes },
  yaxis15: { ...defaultExtraYAxes },
  yaxis16: { ...defaultExtraYAxes },
  yaxis17: { ...defaultExtraYAxes },
  yaxis18: { ...defaultExtraYAxes },
  yaxis19: { ...defaultExtraYAxes },
  yaxis20: { ...defaultExtraYAxes },
  yaxis21: { ...defaultExtraYAxes },
  yaxis22: { ...defaultExtraYAxes },
  yaxis23: { ...defaultExtraYAxes },
  yaxis24: { ...defaultExtraYAxes },
  yaxis25: { ...defaultExtraYAxes },
  yaxis26: { ...defaultExtraYAxes },
  yaxis27: { ...defaultExtraYAxes },
  yaxis28: { ...defaultExtraYAxes },
  yaxis29: { ...defaultExtraYAxes },
  yaxis30: { ...defaultExtraYAxes },
  margin: {
    b: 50,
    t: 0,
    l: 60,
    r: 60,
  },
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
};

const themeAxisStyle = {
  tickcolor: "rgba(127,127,127,.3)",
  gridcolor: "rgba(127,127,127,.3)",
  linecolor: "rgba(127,127,127,.3)",
  zerolinecolor: "rgba(127,127,127,.3)",
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
    yaxis10: { ...themeAxisStyle },
    yaxis11: { ...themeAxisStyle },
    yaxis12: { ...themeAxisStyle },
    yaxis13: { ...themeAxisStyle },
    yaxis14: { ...themeAxisStyle },
    yaxis15: { ...themeAxisStyle },
    yaxis16: { ...themeAxisStyle },
    yaxis17: { ...themeAxisStyle },
    yaxis18: { ...themeAxisStyle },
    yaxis19: { ...themeAxisStyle },
    yaxis20: { ...themeAxisStyle },
    yaxis21: { ...themeAxisStyle },
    yaxis22: { ...themeAxisStyle },
    yaxis23: { ...themeAxisStyle },
    yaxis24: { ...themeAxisStyle },
    yaxis25: { ...themeAxisStyle },
    yaxis26: { ...themeAxisStyle },
    yaxis27: { ...themeAxisStyle },
    yaxis28: { ...themeAxisStyle },
    yaxis29: { ...themeAxisStyle },
    yaxis30: { ...themeAxisStyle },
  };

  return merge(no_theme ? {} : theme, no_default_layout ? {} : defaultLayout);
}
