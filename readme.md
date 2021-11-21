# Plotly Graph Card

![](demo.gif)
![](demo2.gif)

## [Post in HomeAssistant community forum](https://community.home-assistant.io/t/plotly-interactive-graph-card/347746)

You may find some extra info there in this link

## Share and see what others are doing with this

Check out the [Discussion](https://github.com/dbuezas/lovelace-plotly-graph-card/discussions) section (new!)
Eventually I hope we accumulate a bunch of nice looking plots and yaml examples there :)

## Install through HACS

1. Go to `HACS` / `Frontend` / `click [⋮] on the top right` / `Custom Repositories`
2. Paste the url of this repo
3. Select `Lovelace` as Category
4. Close the popup
5. Click install under in the new `Plotly Graph Card` box.

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

![](example1.png)

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
config:
  scrollZoom: false

hours_to_show: 1
refresh_interval: 10 # in seconds
```

### Range Selector buttons

![](rangeselector.apng)

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
entities:
  - entity: sensor.temperature
  - entity: sensor.humidity
```

## Extra entity attributes:

```yaml
entities:
  - entity: sensor.temperature_in_celsius
    name: living temperature in Farenheit # Overrides the entity name
    lambda: |- # Transforms the data
      (ys) => ys.map(y => (y × 9/5) + 32)
    unit_of_measurement: °F # Overrides the unit
```

### `lambda:` transforms

`lambda` takes a js function (as a string) to pre process the data before plotting it. Here you can do things like normalisation, integration. For example:

#### Normalisation wrt to last

```yaml
type: custom:plotly-graph
entities:
  - entity: sensor.my_sensor
     lambda: |-
        (ys) => ys.map(y => y/ys[ys.length-1])
```

#### Normalisation wrt to first fetched value

```yaml
  - entity: sensor.my_sensor
     lambda: |-
        (ys) => ys.map(y => y/ys[0])
```

note: `ys[0]` represents the first "known" value, which is the value furthest to the past among the downloaded data. This value will change if you scroll, zoom out, change the hours_to_show, or just let time pass.

#### Accumulated value

```yaml
  - entity: sensor.my_sensor
     unit_of_measurement: "total pulses"
     lambda: |-
        (ys) => {
          let accumulator = 0;
          return ys.map(y => accumulator + y)
        }
```

#### Derivative

```yaml
  - entity: sensor.my_sensor
     unit_of_measurement: "pulses / second"
     lambda: |-
        (ys, xs) => {
          let last = {
            x: new Date(),
            y: 0,
          }
          return ys.map((y, index) => {
            const x = xs[index];
            const dateDelta = x - last.x;
            accumulator += (y - last.y) / dateDelta;
            last = { x, y };
            return accumulator;
          })
        }
```

#### Right hand riemann integration

```yaml
  - entity: sensor.my_sensor
     unit_of_measurement: "kWh"
     lambda: |-
        (ys, xs) => {
          let accumulator = 0;
          let last = {
            x: new Date(),
            y: 0,
          }
          return ys.map((y, index) => {
            const x = xs[index]
            const dateDelta = x - last.x;
            accumulator += last.y * dateDelta;
            last = { x, y };
            return accumulator;
          })
        }
```

## layout:

To define layout aspects, like margins, title, axes names, ...
Anything from https://plotly.com/javascript/reference/layout/.

## config:

To define general configurations like enabling scroll to zoom, disabling the modebar, etc.
Anything from https://plotly.com/javascript/configuration-options/.

## hours_to_show:

How many hours are shown.
Exactly the same as the history card, except decimal values (e.g `0.1`) do actually work

## refresh_interval:

Update data every `refresh_interval` seconds. Use `0` or delete the line to disable updates

# Development

- Clone the repo
- run `npm i`
- run `npm start`
- From a dashboard in edit mode, go to `Manage resources` and add `http://127.0.0.1:8000/plotly-graph-card.js` as url with resource type JavaScript
- ATTENTION: The development card is `type: custom:plotly-graph-dev`

# Build

`npm run build`

# Release

- `npm version minor`
- git push

Proper HACS integration and automated release pending.
