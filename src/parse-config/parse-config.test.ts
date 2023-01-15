import { ConfigParser } from "./parse-config";

const the_config = {
  refresh_interval: '$fn ({vars, hass}) => "auto"',
  offset: '$fn ({vars, hass}) => {vars.a_var = "from offset"; return "5s";}',
  hours_to_show: "$fn ({vars, hass, xs, ys}) => 5",
  color_scheme: `$fn ()=>0`,

  entities: [
    {
      entity: "sensor.temperature",
      attribute: '$fn ({vars, hass}) => "temperature"',
      offset: "5s",
      unit_of_measurement: "W",
      text: "$fn ({vars, hass, xs, ys}) => { vars.ys = ys; return ys.map(y => 'y=${y}')}",
      filters: [
        {
          add: "$fn ({vars, hass}) => 5",
        },
      ],
    },
  ],
  defaults: {
    entity: {
      internal: "$fn ({vars, hass, xs, ys}) => ys.map(y => y%2)",
      show_value: true,
    },
    yaxes: {
      autorange: "$fn ({vars, hass}) => true",
      fixedrange: false,
    },
  },
  title: "$fn ({vars, hass}) => vars.a_var",
  layout: {
    legend: { traceorder: "normal" },
  },
  disable_pinch_to_zoom: "$fn ({vars, hass}) => vars.a_var",
  stuff_coming_from_fetched_data: "$fn ({vars, hass}) => vars",
};

const parser = new ConfigParser();
const hass = {};
const cssVars = {
  "--card-background-color": "--card-background-color",
  "--primary-background-color": "--primary-background-color",
  "--primary-color": "--primary-color",
  "--primary-text-color": "--primary-text-color",
  "--secondary-text-color": "--secondary-text-color",
};

describe("ConfigParser", () => {
  it("Can parse", async () => {
    await parser.update({
      raw_config: the_config,
      hass,
      cssVars,
    });
    expect(parser.config).toMatchSnapshot();
  });
});
console.log(JSON.stringify(parser.config, null, 2));
