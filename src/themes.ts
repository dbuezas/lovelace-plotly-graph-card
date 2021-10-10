import merge from "lodash-es/merge";
export const raw = {};

const base: Partial<Plotly.Layout> = {
  height: 280,
  yaxis: {
    zeroline: false,
    showline: true,
    fixedrange: true,
  },
  xaxis: {
    zeroline: false,
    showline: true,
  },
  margin: {
    b: 40,
    t: 0,
    l: 60,
    r: 10,
  },
  legend: {
    orientation: "h",
  },
  dragmode: "pan",
};

export const dark: Partial<Plotly.Layout> = merge({}, base, {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  yaxis: {
    tickcolor: "rgb(63,63,63)",
    gridcolor: "rgb(63,63,63)",
    zerolinecolor: "rgb(63,63,63)",
  },
  xaxis: {
    tickcolor: "rgb(63,63,63)",
    gridcolor: "rgb(63,63,63)",
    zerolinecolor: "rgb(63,63,63)",
  },
  font: {
    color: "rgb(136,136,136)",
  },
});

export const white: Partial<Plotly.Layout> = merge({}, base, {
  yaxis: {
    zerolinecolor: "rgb(63,63,63)",
  },
});
