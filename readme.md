[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/dbuezas)
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)

# Plotly Graph Card

<img src="https://user-images.githubusercontent.com/777196/202489269-184d2f30-e834-4bea-8104-5aedb7d6f2d0.gif" width="300" align="left">
<img src="https://user-images.githubusercontent.com/777196/202489368-234c7fbd-b33d-4fd0-8885-80f9e704a191.gif" width="300" align="right">

<br clear="both"/>
<br clear="both"/>

<img src="https://user-images.githubusercontent.com/777196/148675247-6e838783-a02a-453c-96b5-8ce86094ece2.gif" width="300" align="left" >
<img src="https://user-images.githubusercontent.com/37914650/148646429-34f32f23-20b8-4171-87d3-ca69d8ab34b1.JPG" width="300" align="right">

<br clear="both"/>
<br clear="both"/>

<img src="https://user-images.githubusercontent.com/777196/198649220-14af3cf2-8948-4174-8138-b669dce5319e.png" width="300" align="left" >

<img src="https://user-images.githubusercontent.com/52346449/142386216-dfc22660-b053-495d-906f-0ebccbdf985f.png" width="300" align="right" >

<br clear="both"/>

## [Post in HomeAssistant community forum](https://community.home-assistant.io/t/plotly-interactive-graph-card/347746)

You may find some extra info there in this link

## More yaml examples

Find more advanced examples in [Show & Tell](https://github.com/dbuezas/lovelace-plotly-graph-card/discussions/categories/show-and-tell)

## Installation

### Via Home Assistant Community Store (Recommended)

1. Install [HACS](https://hacs.xyz/docs/configuration/basic)
2. Search & Install `Plotly Graph Card`.

### Manually

1. Go to [Releases](https://github.com/dbuezas/lovelace-plotly-graph-card/releases)
2. Download `plotly-graph-card.js` and copy it to your Home Assistant config dir as `<config>/www/plotly-graph-card.js`
3. Add a resource to your dashboard configuration. There are two ways:
   1. **Using UI**: `Settings` → `Dashboards` → `More Options icon` → `Resources` → `Add Resource` → Set Url as `/local/plotly-graph-card.js` → Set Resource type as `JavaScript Module`.
      _Note: If you do not see the Resources menu, you will need to enable Advanced Mode in your User Profile_
   2. **Using YAML**: Add following code to lovelace section.
      ```resources:
        - url: /local/plotly-graph-card.js
          type: module
      ```

## Card Config

_**New**_ Visual Config editor available for Basic Configs (\*)

```yaml
type: custom:plotly-graph
entities:
  - sensor.monthly_internet_energy
  - sensor.monthly_teig_energy
  - sensor.monthly_office_energy
  - sensor.monthly_waschtrockner_energy
hours_to_show: 24
refresh_interval: 10
```

(\*) I'm reusing the editor of the standard History Card. Cheap, yes, but it works fine. Use yaml for advanced functionality

## Advanced

### Filling, line width, color

![](docs/resources/example1.png)

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.office_plug_wattage
  # see examples: https://plotly.com/javascript/line-and-scatter/
  # see full API: https://plotly.com/javascript/reference/scatter/#scatter
  - entity: sensor.freezer_plug_power
    fill: tozeroy
    line:
      color: red
      dash: dot
      width: 1

layout:
  plot_bgcolor: lightgray
  height: 400
config:
  scrollZoom: false

hours_to_show: 1
refresh_interval: 10 # in seconds
```

### Range Selector buttons

![](docs/resources/rangeselector.apng)

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
refresh_interval: 10
hours_to_show: 12
layout:
  xaxis:
    rangeselector:
      # see examples: https://plotly.com/javascript/range-slider/
      # see API: https://plotly.com/javascript/reference/layout/xaxis/#layout-xaxis-rangeselector
      "y": 1.2
      buttons:
        - count: 1
          step: minute
        - count: 1
          step: hour
        - count: 12
          step: hour
        - count: 1
          step: day
        - count: 7
          step: day
```

## Features

- Anything you can do with scatter and barcharts in plotly
- Zoom / Pan, etc.
- Data is loaded in the background
- Axes are automatically configured based on the units of each trace
- Configuration compatible with the History Card

For now only the only allowed chart types are:

- Bar charts https://plotly.com/javascript/bar-charts/#basic-bar-chart
- Line and scatter https://plotly.com/javascript/line-and-scatter/

## Entities:

- `entities` translates to the `data` argument in PlotlyJS

  - each `entity` will be translated to a trace inside the data array.
    - `x` (states) and `y` (timestamps of stored states)
    - you can add any attribute that works in a plotly trace
    - see https://plotly.com/javascript/reference/scatter/#scatter-line for more

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
  - entity: sensor.humidity
```

Alternatively:

```yaml
type: custom:plotly-graph
entities:
  - sensor.temperature
  - sensor.humidity
```

## Color schemes

Changes default line colors.
See more here: https://github.com/dbuezas/lovelace-plotly-graph-card/blob/master/src/color-schemes.ts

```yaml
type: custom:plotly-graph
entities:
  - sensor.temperature1
  - sensor.temperature2
color_scheme: dutch_field
# or use numbers instead 0 to 24 available:
# color_scheme: 1
# or pass your color scheme
# color_scheme: ["#1b9e77","#d95f02","#7570b3","#e7298a","#66a61e","#e6ab02","#a6761d","red"]
```

### Attribute values

Plot the attributes of an entity

```yaml
type: custom:plotly-graph
entities:
  - entity: climate.living
    attribute: temperature
  - entity: climate.kitchen
    attribute: temperature
```

### Statistics support

Fetch and plot long-term statistics of an entity

#### for entities with state_class=measurement (normal sensors, like temperature)

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
    statistic: max # `min`, `mean` of `max`
    period: 5minute # `5minute`, `hour`, `day`, `week`, `month`, `auto` # `auto` varies the period depending on the zoom level
```

The option `auto` makes the period relative to the currently visible time range. It picks the longest period, such that there are at least 100 datapoints in screen.

#### for entities with state_class=total (such as utility meters)

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
    statistic: state # `state` or `sum`
    period: 5minute # `5minute`, `hour`, `day`, `week`, `month`, `auto` # `auto` varies the period depending on the zoom level
```

#### automatic period

The period will automatically adapt to the visible range.

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
    statistic: mean
    period: auto
```

equivalent to:

```yaml
period:
  0s: 5minute
  1d: hour
  7d: day
  28d: week
  12M: month # note uppercase M
```

#### step function for auto period

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
    statistic: mean
    period:
      0s: 5minute
      24h: hour # when the visible range is ≥ 1 day, use the `hour` period
      7d: day # from 7 days on, use `day`
      6M: week # from 6 months on, use weeks. Note Uppercase M! (lower case m means minutes)
      1y: month # from 1 year on, use `month
```

Note that `5minute` period statistics are limited in time as normal recorder history is, contrary to other periods which keep data for years.

## show_value:

Shows the value of the last datapoint as text in the plot.

Examples:

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature
    show_value: true
```

Often one wants this to be the case for all entities

```yaml
defaults:
  entity:
    show_value: true
```

If you want to make extra room for the value, you can either increase the right margin of the whole plot like this:

```yaml
layout:
  margin:
    r: 100
```

Or make space inside the the plot like this:

```yaml
defaults:
  entity:
    show_value:
      right_margin: 20 # this is 20% of the space in the x axis
```

## Offsets

Offsets are useful to shift data in the temporal axis. For example, if you have a sensor that reports the forecasted temperature 3 hours from now, it means that the current value should be plotted in the future. With the `offset` attribute you can shift the data so it is placed in the correct position.
Another possible use is to compare past data with the current one. For example, you can plot yesterday's temperature and the current one on top of each other.

The `offset` flag can be specified in two places.
**1)** When used at the top level of the configuration, it specifies how much "future" the graph shows by default. For example, if `hours_to_show` is 16 and `offset` is 3h, the graph shows the past 13 hours (16-3) plus the next 3 hours.
**2)** When used at the trace level, it offsets the trace by the specified amount.

```yaml
type: custom:plotly-graph
hours_to_show: 16
offset: 3h
entities:
  - entity: sensor.current_temperature
    line:
      width: 3
      color: orange
  - entity: sensor.current_temperature
    name: Temperature yesterday
    offset: 1d
    line:
      width: 1
      dash: dot
      color: orange
  - entity: sensor.temperature_12h_forecast
    offset: 12h
    name: Forecast temperature
    line:
      width: 1
      dash: dot
      color: grey
```

![Graph with offsets](docs/resources/offset-temperature.png)

### Caveats

The following exceptions apply to traces with offsets:

- They get their own cache, meaning that data will be fetched twice if the same entity is in the plot with a different (or no) offset.
- Websocket state updates are not used to fill their cache (but a request to the server may be triggered)
- `extend_to_present` is ignored (because extending to an offset present may be far into the future and that messes up with autorange)

### Now line

When using offsets, it is useful to have a line that indicates the current time. This can be done by using a lambda function that returns a line with the current time as x value and 0 and 1 as y values. The line is then hidden from the legend.

```yaml
type: custom:plotly-graph
hours_to_show: 6
offset: 3h
entities:
  - entity: sensor.forecast_temperature
    yaxis: y1
    offset: 3h
  - entity: sensor.nothing_now
    name: Now
    yaxis: y9
    showlegend: false
    line:
      width: 1
      dash: dot
      color: deepskyblue
    lambda: |-
      () => {
        return {x:[Date.now(),Date.now()], y:[0,1]}
      }
layout:
  yaxis9:
    visible: false
    fixedrange: true
```

![Graph with offsets and now-line](docs/resources/offset-nowline.png)

## Duration

Whenever a time duration can be specified, this is the notation to use:

| Unit         | Suffix | Notes    |
| ------------ | ------ | -------- |
| Milliseconds | `ms`   |          |
| Seconds      | `s`    |          |
| Minutes      | `m`    |          |
| Hours        | `h`    |          |
| Days         | `d`    |          |
| Weeks        | `w`    |          |
| Months       | `M`    | 30 days  |
| Years        | `y`    | 365 days |

Example:

```yaml
offset: 3h
```

## Extra entity attributes:

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature_in_celsius
    name: living temperature in Farenheit # Overrides the entity name
    lambda: |- # Transforms the data
      (ys) => ys.map(y => (y × 9/5) + 32)
    unit_of_measurement: °F # Overrides the unit
    show_value: true # shows the last value as text
    texttemplate: >- # custom format for show_value
      <b>%{y}</b>%{customdata.unit_of_measurement}<br>
      %{customdata.name}
      # to show only 2 decimals: "%{y:.2f}"
      # see more here: https://plotly.com/javascript/reference/pie/#pie-texttemplate

    hovertemplate: >- # custom format for tooltip
      <b>%{customdata.name}</b><br><i>%{x}</i><br>
      %{y}%{customdata.unit_of_measurement}
      <extra></extra>
```

### Extend_to_present

The boolean `extend_to_present` will take the last known datapoint and "expand" it to the present by creating a duplicate and setting its date to `now`.
This is useful to make the plot look fuller.
It's recommended to turn it off when using `offset`s, or when setting the mode of the trace to `markers`.
Defaults to `true` for state history, and `false` for statistics.

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.weather_24h_forecast
    mode: "markers"
    extend_to_present: false # true by default for state history
  - entity: sensor.actual_temperature
    statistics: mean
    extend_to_present: true # false by default for statistics
```

### `filters:`

Filters are used to process the data before plotting it. Heavily inspired by [ESPHome's sensor filters](https://esphome.io/components/sensor/index.html#sensor-filters).
Filters are applied in order.

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature_in_celsius
  filters:

    # The filters below will only be applied to numeric values. Missing (unavailable) and non-numerics will be left untouched
    - add: 5 # adds 5 to each datapoint
    - multiply: 2 # multiplies each datapoint by 2
    - calibrate_linear:
      # Left of the arrow are the measurements, right are the expected values.
      # The mapping is then approximated through linear regression, and that correction is applied to the data.
      - 0.0 -> 0.0
      - 40.0 -> 45.0
      - 100.0 -> 102.5
    - delata # computes the delta between each two consecutive numeric y values.
    - derivate: h # computes rate of change per unit of time: h # ms (milisecond), s (second), m (minute), h (hour), d (day), w (week), M (month), y (year)
    - integrate: h # computes area under the curve per unit of time using Right hand riemann integration. Same units as the derivative
    - map_y_numbers: Math.sqrt(y + 10*100) # map the y coordinate of each datapoint.

    # In the filters below, missing and non numeric datapoints will be discarded
    - sliding_window_moving_average:
        # default parameters:
        window_size: 10
        extended: false # when true, smaller window sizes are used on the extremes.
        centered: true # compensate for averaging lag by offsetting the x axis by half a window_size
    - median:
        # default parameters:
        window_size: 10
        extended: false
        centered: true
    - exponential_moving_average:
        # default parameters:
        alpha: 0.1 # between 0 an 1. The lower the alpha, the smoother the trace.

    # The filters below receive all datapoints as they come from home assistant. Y values are strings or null (unless previously mapped to numbers or any other type)
    - map_y: 'y === "heat" ? 1 : 0' # map the y values of each datapoint. Variables `i` (index), `x`, `y`, `state`, `statistic`, `meta`, `vars` and `hass` are in scope. The outer quoutes are there because yaml doesn't like colons in strings without quoutes.
    - map_x: new Date(+x + 1000) # map the x coordinate (javascript date object) of each datapoint. Same variables as map_y are in scope
    - fn: |- # arbitrary function. Only the keys that are returned are replaced. Returning null or undefined, leaves the data unchanged (useful )

        ({xs, ys, meta, states, statistics, hass}) => {
          # either statistics or states will be available, depending on if "statistics" are fetched or not
          # attributes will be available inside states only if an attribute is picked in the trace
          return {
            ys: states.map(state => +state?.attributes?.current_temperature - state?.attributes?.target_temperature + hass.states.get("sensor.inside_temp")),
            meta: { unit_of_measurement: "delta" }
          };
        },
    - resample: 5m # Rebuilds data so that the timestamps in xs are exact multiples of the specified interval, and without gaps. The parameter is the length of the interval and defaults to 5 minutes (see #duration for the format). This is useful when combining data from multiple entities, as the index of each datapoint will correspond to the same instant of time across them.
    - filter: y !== null && +y > 0 && x > new Date(Date.now()-1000*60*60) # filter out datapoints for which this returns false. Also filters from xs, states and statistics. Same variables as map_y are in scope
    - force_numeric # converts number-lookinig-strings to actual js numbers and removes the rest. Any filters used after this one will receive numbers, not strings or nulls. Also removes respective elements from xs, states and statistics parameters
```

#### Examples

##### Celcious to farenheit

```yaml
- entity: sensor.wintergarten_clima_temperature
  unit_of_measurement: °F
  filters: # °F = °C×(9/5)+32
    - multiply: 1.8
    - add: 32
```

alternatively,

```yaml
- entity: sensor.wintergarten_clima_temperature
  unit_of_measurement: °F
  filters: # °F = °C×(9/5)+32
    - map_y_numbers: y * 9/5 + 32
```

##### Energy from power

```yaml
- entity: sensor.fridge_power
  filters:
    - integrate: h # resulting unit_of_measurement will be W/h
```

##### Using state attributes

```yaml
- entity: climate.loungetrv_climate
  attribute: current_temperature # an attribute must be set to ensure attributes are fetched.
  filters:
    - map_y_numbers: |
        state.state === "heat" ? state.attributes.current_temperature : 0
```

or alternatively,

```yaml
- map_y_numbers: 'state.state === "heat" ? y : 0'
```

or alternatively,

```yaml
- map_y_numbers: |
    {
      const isHeat = state.state === "heat";
      return isHeat ? y : 0;
    }
```

or alternatively,

```yaml
- map_y: |
    state?.state === "heat" ? state.attributes?.current_temperature : 0
```

or alternatively,

```yaml
- fn: |-
    ({ys, states}) => ({
      ys: states.map((state, i) =>
        state?.state === "heat" ? state.attributes?.current_temperature : 0
      ),
    }),
```

or alternatively,

```yaml
- fn: |-
    ({ys, states}) => {
      return {
        ys: states.map((state, i) =>
          state?.state === "heat" ? state.attributes?.current_temperature : 0
        ),
      }
    },
```

#### Advanced

##### Debugging

1. Open [your browser's devtools console](https://balsamiq.com/support/faqs/browserconsole/)
2. Use `console.log` or the `debugger` statement to execute your map filter step by step
   ```yaml
   type: custom:plotly-graph
   entities:
     - entity: sensor.temperature_in_celsius
       statistics: mean
       filters:
         - fn: console.log # open the devtools console to see the data
         - fn: |-
             (params) => {
               const ys = [];
               debugger;
               for (let i = 0; i < params.statistics.length; i++){
                 ys.pushh(params.statistics.max); // <--- here's the bug
               }
               return { ys };
             }
   ```

##### Using the hass object

Funcitonal filters receive `hass` (Home Assistant) as parameter, which gives you access to the current states of all entities.

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.power_consumption
    filters:
      - map_y: parseFloat(y) * parseFloat(hass.states['sensor.cost'].state)
```

##### Using vars

Compute absolute humidity

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.wintergarten_clima_humidity
    internal: true
    filters:
      - resample: 5m # important so the datapoints align in the x axis
      - map_y: parseFloat(y)
      - store_var: relative_humidity
  - entity: sensor.wintergarten_clima_temperature
    period: 5minute
    name: Absolute Hty
    unit_of_measurement: g/m³
    filters:
      - resample: 5m
      - map_y: parseFloat(y)
      - map_y: (6.112 * Math.exp((17.67 * y)/(y+243.5)) * +vars.relative_humidity.ys[i] * 2.1674)/(273.15+y);
```

Compute dew point

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.openweathermap_humidity
    internal: true
    period: 5minute # important so the datapoints align in the x axis. Alternative to the resample filter using statistics
    filters:
      - map_y: parseFloat(y)
      - store_var: relative_humidity
  - entity: sensor.openweathermap_temperature
    period: 5minute
    name: Dew point
    filters:
      - map_y: parseFloat(y)
      - map_y: >-
          {
            // https://www.omnicalculator.com/physics/dew-point
            const a = 17.625;
            const b = 243.04;
            const T = y;
            const RH = vars.relative_humidity.ys[i];
            const α = Math.log(RH/100) + a*T/(b+T);
            const Ts = (b * α) / (a - α);
            return Ts; 
          }
hours_to_show: 24
```

### `internal:`

setting it to `true` will remove it from the plot, but the data will still be fetch. Useful when the data is only used by a filter in a different trace

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature1
    internal: true
    period: 5minute
    filters:
      store_var: temp1
  - entity: sensor.temperature2
    period: 5minute
    name: sum of temperatures
    filters:
      map_y: y + vars.temp1[i].y
```

### `lambda:` transforms (deprecated)

Deprecated. Use filters instead.
Your old lambdas should still work for now but this API will be removed in March 2023.

## Default trace & axis styling

default configurations for all entities and all yaxes (e.g yaxis, yaxis2, yaxis3, etc).

```yaml
type: custom:plotly-graph
entities:
  - sensor.temperature1
  - sensor.temperature2
defaults:
  entity:
    fill: tozeroy
    line:
      width: 2
  yaxes:
    fixedrange: true # disables vertical zoom & scroll
```

## layout:

To define layout aspects, like margins, title, axes names, ...
Anything from https://plotly.com/javascript/reference/layout/.

### disable default layout:

Use this if you want to use plotly default layout instead. Very useful for heavy customization while following pure plotly examples.

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature_in_celsius
no_default_layout: true
```

### disable Home Assistant themes:

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.temperature_in_celsius
no_theme: true
```

## config:

To define general configurations like enabling scroll to zoom, disabling the modebar, etc.
Anything from https://plotly.com/javascript/configuration-options/.

## disable_pinch_to_zoom

```yaml
disable_pinch_to_zoom: true # defaults to false
```

When true, the custom implementations of pinch-to-zoom and double-tap-drag-to-zooming will be disabled.

## hours_to_show:

How many hours are shown.
Exactly the same as the history card, except decimal values (e.g `0.1`) do actually work

## refresh_interval:

Update data every `refresh_interval` seconds.

Examples:

```yaml
refresh_interval: auto # (default) update automatically when an entity changes its state.
refresh_interval: 0 # never update.
refresh_interval: 5 # update every 5 seconds
```

# Development

- Clone the repo
- run `npm i`
- run `npm start`
- From a dashboard in edit mode, go to `Manage resources` and add `http://127.0.0.1:8000/plotly-graph-card.js` as url with resource type JavaScript
- ATTENTION: The development card is `type: custom:plotly-graph-dev` (mind the extra `-dev`)
- Either use Safari or Enable [chrome://flags/#unsafely-treat-insecure-origin-as-secure](chrome://flags/#unsafely-treat-insecure-origin-as-secure) and add your HA address (e.g http://homeassistant.local:8123): Chrome doesn't allow public network resources from requesting private-network resources - unless the public-network resource is secure (HTTPS) and the private-network resource provides appropriate (yet-undefined) CORS headers. More [here](https://stackoverflow.com/questions/66534759/chrome-cors-error-on-request-to-localhost-dev-server-from-remote-site)

# Build

`npm run build`

# Release

- Click on releases/new draft from tag in github
- The bundle will be built by the CI action thanks to @zanna-37 in #143
