// import Plotly from "plotly.js-dist";
// export default Plotly as typeof import("plotly.js");

// TODO: optimize bundle size
window.global = window;
var Plotly = require("plotly.js/lib/core") as typeof import("plotly.js");
Plotly.register([
  // traces
  require("plotly.js/lib/bar"),
  require("plotly.js/lib/box"),
  require("plotly.js/lib/heatmap"),
  require("plotly.js/lib/histogram"),
  require("plotly.js/lib/histogram2d"),
  require("plotly.js/lib/histogram2dcontour"),
  require("plotly.js/lib/contour"),

  require("plotly.js/lib/scatterternary"),
  require("plotly.js/lib/violin"),
  require("plotly.js/lib/funnel"),
  require("plotly.js/lib/waterfall"),
  // require("plotly.js/lib/image"), // NOGO
  require("plotly.js/lib/pie"),
  require("plotly.js/lib/sunburst"),
  require("plotly.js/lib/treemap"),
  require("plotly.js/lib/icicle"),
  require("plotly.js/lib/funnelarea"),

  require("plotly.js/lib/scatter3d"),
  require("plotly.js/lib/surface"),
  require("plotly.js/lib/isosurface"),
  require("plotly.js/lib/volume"),
  require("plotly.js/lib/mesh3d"),
  require("plotly.js/lib/cone"),
  require("plotly.js/lib/streamtube"),
  require("plotly.js/lib/scattergeo"),
  require("plotly.js/lib/choropleth"),
  require("plotly.js/lib/pointcloud"),
  require("plotly.js/lib/heatmapgl"),
  require("plotly.js/lib/parcats"),
  // require("plotly.js/lib/scattermapbox"),
  // require("plotly.js/lib/choroplethmapbox"),
  // // require("plotly.js/lib/densitymapbox"),
  require("plotly.js/lib/sankey"),
  require("plotly.js/lib/indicator"),
  require("plotly.js/lib/table"),
  require("plotly.js/lib/carpet"),
  require("plotly.js/lib/scattercarpet"),
  require("plotly.js/lib/contourcarpet"),
  require("plotly.js/lib/ohlc"),
  require("plotly.js/lib/candlestick"),
  require("plotly.js/lib/scatterpolar"),
  require("plotly.js/lib/barpolar"),

  // transforms
  require("plotly.js/lib/aggregate"),
  require("plotly.js/lib/filter"),
  require("plotly.js/lib/groupby"),
  require("plotly.js/lib/sort"),

  // components
  require("plotly.js/lib/calendars"),
]);

export default Plotly;
//*/
