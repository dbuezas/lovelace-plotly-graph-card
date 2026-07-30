import Plotly from "../src/plotly";

declare global {
  interface Window {
    PlotlyTest: typeof Plotly;
  }
}

window.PlotlyTest = Plotly;
