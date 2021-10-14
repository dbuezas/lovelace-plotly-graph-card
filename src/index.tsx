import register from "preact-custom-element";
import Card from "./Card";
import { version } from "../package.json";
import { RecoilRoot } from "recoil";

function App(props) {
  return (
    <RecoilRoot>
      <Card {...props} />
    </RecoilRoot>
  );
}

register(App, "plotly-graph", ["config", "hass"]);

console.info(
  `%c PLOTLY-GRAPH-CARD %c ${version} `,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);
const proto = document.createElement("plotly-graph").constructor.prototype;
proto.setConfig = function (config) {
  return (this.config = config);
};
