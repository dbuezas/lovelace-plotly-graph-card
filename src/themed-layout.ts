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

export default function getThemedLayout(
  haTheme: HATheme
): Partial<Plotly.Layout> {
  const axisStyle = {
    tickcolor: "rgba(127,127,127,.3)",
    gridcolor: "rgba(127,127,127,.3)",
    linecolor: "rgba(127,127,127,.3)",
    zerolinecolor: "rgba(127,127,127,.3)",
    // automargin: true,
  };
  return merge(
    {
      paper_bgcolor: haTheme["--card-background-color"],
      plot_bgcolor: haTheme["--card-background-color"],
      xaxis: { ...axisStyle },
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
