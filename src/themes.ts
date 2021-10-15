import merge from "lodash-es/merge";
export const raw = {};

const base: Partial<Plotly.Layout> = {
  height: 280,
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
    b: 0,
    t: 10,
    l: 60,
    r: 10,
  },
  legend: {
    orientation: "h",
    y: -0.2,
  },
};

const axisStyle = {
  tickcolor: "rgb(63,63,63)",
  gridcolor: "rgb(63,63,63)",
  zerolinecolor: "rgb(63,63,63)",
};
export const dark: Partial<Plotly.Layout> = merge({}, base, {
  paper_bgcolor: "rgba(0,0,0,0)",
  // plot_bgcolor: "rgba(0,0,0,0)",
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
    color: "rgb(136,136,136)",
  },
});

export const white: Partial<Plotly.Layout> = merge({}, base, {
  yaxis: {
    zerolinecolor: "rgb(63,63,63)",
  },
});
