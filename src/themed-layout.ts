import merge from "lodash/merge";
import { HATheme } from "./types";

const defaultLayout: Partial<Plotly.Layout> = {
  height: 260,
  xaxis: {
    zeroline: false,
    showline: true,
    automargin: true,
  },
  yaxis: {
    zeroline: false,
    showline: true,
    // fixedrange: true,
  },
  yaxis2: {
    side: "right",
    overlaying: "y",
  },
  margin: {
    b: 0, // 50,
    t: 0, // 10,
    l: 0, // 60,
    r: 0, // 10,
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

export default function getThemedLayout(
  haTheme: HATheme
): Partial<Plotly.Layout> {
  const axisStyle = {
    tickcolor: "rgba(127,127,127,.3)",
    gridcolor: "rgba(127,127,127,.3)",
    linecolor: "rgba(127,127,127,.3)",
    zerolinecolor: "rgba(127,127,127,.3)",
    automargin: true,
  };
  return merge(
    {
      paper_bgcolor: haTheme["--card-background-color"],
      plot_bgcolor: haTheme["--card-background-color"],
      xaxis: { ...axisStyle },
      xaxis2: { ...axisStyle },
      xaxis3: { ...axisStyle },
      xaxis4: { ...axisStyle },
      xaxis5: { ...axisStyle },

      yaxis: { ...axisStyle },
      yaxis2: { ...axisStyle },
      yaxis3: { ...axisStyle },
      yaxis4: { ...axisStyle },
      yaxis5: { ...axisStyle },
      font: {
        color: haTheme["--secondary-text-color"],
        size: 11,
      },
    },
    defaultLayout
  );
}
