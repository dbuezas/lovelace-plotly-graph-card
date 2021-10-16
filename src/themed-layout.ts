import merge from "lodash/merge";
import { HATheme } from "./types";
const defaultLayout: Partial<Plotly.Layout> = {
  height: 250,
  yaxis: {
    zeroline: false,
    showline: true,
    // fixedrange: true,
  },
  xaxis: {
    zeroline: false,
    showline: true,
  },
  margin: {
    b: 50,
    t: 10,
    l: 60,
    r: 10,
  },
  legend: {
    orientation: "h",
    x: 0,
    y: 1.3,
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
  };
  return merge(
    {
      paper_bgcolor: haTheme["--card-background-color"],
      plot_bgcolor: haTheme["--card-background-color"],
      xaxis: axisStyle,
      xaxis2: axisStyle,
      xaxis3: axisStyle,
      xaxis4: axisStyle,
      xaxis5: axisStyle,

      yaxis: axisStyle,
      yaxis2: axisStyle,
      yaxis3: axisStyle,
      yaxis4: axisStyle,
      yaxis5: axisStyle,
      font: {
        color: haTheme["--secondary-text-color"],
        size: 11,
      },
    },
    defaultLayout
  );
}
