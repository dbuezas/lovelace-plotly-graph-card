import maplibreCss from "maplibre-gl/dist/maplibre-gl.css" with { type: "text" };

// Add MapLibre's CSS like a Plotly style, so cards copy it into their shadow DOM
const style = document.head.appendChild(document.createElement("style"));
style.id = "plotly.js-style-maplibre";
style.textContent = maplibreCss;

export default [
  require("plotly.js/lib/scattermap"),
  require("plotly.js/lib/choroplethmap"),
  require("plotly.js/lib/densitymap"),
];
