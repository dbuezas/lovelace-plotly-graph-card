import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import {
  buildYamlSchema,
  convertPlotlyNode,
  registeredTraceTypes,
} from "./plotly-schema.js";

const directory = path.dirname(fileURLToPath(import.meta.url));

function valueBranch(schema) {
  return schema.anyOf.find((branch) => branch.$ref === undefined);
}

test("converts Plotly scalar constraints and arrayOk", () => {
  const schema = valueBranch(
    convertPlotlyNode({
      arrayOk: true,
      description: "Marker size",
      min: 1,
      valType: "number",
    }),
  );

  assert.equal(schema.description, "Marker size");
  assert.deepEqual(schema.anyOf[0], { type: "number", minimum: 1 });
  assert.deepEqual(schema.anyOf[1], {
    type: "array",
    items: { type: "number", minimum: 1 },
  });
});

test("keeps literal and regular-expression enum alternatives", () => {
  const schema = valueBranch(
    convertPlotlyNode({
      valType: "enumerated",
      values: ["paper", "/^x([2-9]|[1-9][0-9]+)?$/"],
    }),
  );

  assert.deepEqual(schema.anyOf, [
    { enum: ["paper"] },
    { pattern: "^x([2-9]|[1-9][0-9]+)?$", type: "string" },
  ]);
});

test("converts object arrays and dynamic subplot properties", () => {
  const schema = valueBranch(
    convertPlotlyNode({
      annotations: {
        items: {
          annotation: {
            text: { valType: "string" },
          },
        },
        role: "object",
      },
      xaxis: {
        _isSubplotObj: true,
        role: "object",
        visible: { valType: "boolean" },
      },
    }),
  );

  const annotations = valueBranch(schema.properties.annotations);
  assert.equal(annotations.type, "array");
  assert.equal(
    valueBranch(annotations.items).properties.text.anyOf[1].type,
    "string",
  );
  assert.deepEqual(
    schema.patternProperties["^xaxis([2-9]|[1-9][0-9]+)$"],
    schema.properties.xaxis,
  );
});

test("derives enabled traces from uncommented registrations", () => {
  const source = `// traces
    require("plotly.js/lib/bar"),
    // require("plotly.js/lib/image"),
    require("plotly.js/lib/scattermap"),
    // components
    require("plotly.js/lib/calendars"),
  `;
  const runtime = {
    traces: {
      bar: {},
      scatter: {},
      scattermap: {},
    },
  };

  assert.deepEqual(registeredTraceTypes(source, runtime), [
    "scatter",
    "bar",
    "scattermap",
  ]);
});

test("combines card options with runtime Plotly definitions", () => {
  const cardSchema = {
    definitions: {
      CardEntity: {
        type: "object",
        properties: {
          offset: { type: "string" },
          statistic: { enum: ["mean"] },
        },
      },
      UnusedPlotlyType: { type: "object" },
    },
    properties: {
      config: { type: "object" },
      defaults: { type: "object" },
      entities: {
        anyOf: [
          { type: "string" },
          {
            type: "array",
            items: { $ref: "#/definitions/CardEntity" },
          },
        ],
      },
      layout: { type: "object" },
    },
    required: ["entities"],
    type: "object",
  };
  const runtime = {
    config: {
      staticPlot: { valType: "boolean" },
    },
    layout: {
      layoutAttributes: {
        xaxis: {
          _isSubplotObj: true,
          role: "object",
          visible: { valType: "boolean" },
        },
      },
    },
    traces: {
      scatter: {
        attributes: {
          mode: { valType: "enumerated", values: ["lines", "markers"] },
          type: "scatter",
        },
      },
    },
  };

  const schema = buildYamlSchema(cardSchema, runtime, ["scatter"]);

  assert.equal(schema.definitions.UnusedPlotlyType, undefined);
  assert.equal(
    schema.definitions.PlotlyConfig.anyOf[1].properties.staticPlot.anyOf[1]
      .type,
    "boolean",
  );
  assert.ok(
    schema.definitions.PlotlyLayout.anyOf[1].patternProperties[
      "^xaxis([2-9]|[1-9][0-9]+)$"
    ],
  );
  assert.equal(
    schema.definitions.PlotlyTrace_scatter.anyOf[1].properties.type.anyOf[1]
      .const,
    "scatter",
  );
  assert.deepEqual(
    schema.definitions.CardEntity.properties.offset.anyOf[1].anyOf.map(
      ({ type }) => type,
    ),
    ["string", "number", "array"],
  );
});

test("checked-in schema is generated from Plotly runtime metadata", () => {
  const repository = path.resolve(directory, "..");
  const schema = JSON.parse(
    fs.readFileSync(path.join(directory, "src/schema.json"), "utf8"),
  );
  const runtime = JSON.parse(
    fs.readFileSync(
      path.join(repository, "node_modules/plotly.js/dist/plot-schema.json"),
      "utf8",
    ),
  );
  const source = fs.readFileSync(
    path.join(repository, "src/plotly.ts"),
    "utf8",
  );
  const expectedTraces = registeredTraceTypes(source, runtime);
  const generatedTraces = Object.keys(schema.definitions)
    .filter((name) => name.startsWith("PlotlyTrace_"))
    .map((name) => name.slice("PlotlyTrace_".length));

  assert.ok(schema.definitions.PlotlyLayout);
  assert.ok(schema.definitions.PlotlyConfig);
  assert.ok(schema.definitions.PlotlyTrace_scatter);
  assert.deepEqual(generatedTraces, expectedTraces);
  for (const trace of expectedTraces) {
    assert.deepEqual(
      schema.definitions[`PlotlyTrace_${trace}`],
      convertPlotlyNode(runtime.traces[trace].attributes),
      `Regenerate the schema for ${trace}`,
    );
  }
  assert.deepEqual(
    schema.definitions.PlotlyLayout,
    convertPlotlyNode(runtime.layout.layoutAttributes),
  );
  assert.deepEqual(
    schema.definitions.PlotlyConfig,
    convertPlotlyNode(runtime.config),
  );
  assert.equal(
    Object.keys(schema.definitions).some((name) =>
      name.includes("Partial<Plotly."),
    ),
    false,
  );

  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const valid = validate({
    type: "custom:plotly-graph",
    hours_to_show: "24h",
    refresh_interval: 300,
    layout: {
      annotations: [{ text: "Current value", x: 1, y: 2 }],
      xaxis2: { visible: false },
      yaxis: { range: [0, 50] },
    },
    config: {
      displayModeBar: false,
      staticPlot: true,
    },
    entities: [
      {
        entity: "sensor.east",
        fill: "tozeroy",
        line: { shape: "spline" },
        mode: "lines",
        name: "East",
        period: "5minute",
        statistic: "mean",
        type: "scatter",
      },
      {
        entity: "sensor.west",
        marker: { color: "#007bff" },
        offset: -7_200_000,
        type: "bar",
      },
    ],
  });

  assert.equal(valid, true, JSON.stringify(validate.errors, null, 2));
});

test("Plotly 4 schema removes legacy options and validates object titles", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(directory, "src/schema.json"), "utf8"),
  );
  const layout = valueBranch(schema.definitions.PlotlyLayout).properties;
  const config = valueBranch(schema.definitions.PlotlyConfig).properties;
  const scatter = valueBranch(
    schema.definitions.PlotlyTrace_scatter,
  ).properties;
  assert.equal(scatter.xsrc, undefined);
  assert.equal(config.showLink, undefined);
  assert.equal(layout.mapbox, undefined);
  assert.equal(layout.titlefont, undefined);

  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const card = {
    type: "custom:plotly-graph",
    title: "Card title remains a string",
    entities: [{ entity: "sensor.power", type: "scatter" }],
    layout: {
      title: { text: "Energy" },
      yaxis2: { title: { text: "kW", font: { size: 14 } }, tickmode: "sync" },
    },
  };
  assert.equal(validate(card), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...card, layout: { title: "Energy" } }), false);
  assert.equal(
    validate({ ...card, layout: { yaxis2: { title: "kW" } } }),
    false,
  );
  assert.equal(
    validate({ ...card, layout: { title: "$fn () => ({ text: 'Energy' })" } }),
    true,
  );
  assert.equal(
    validate({
      ...card,
      entities: [{ entity: "sensor.power", type: "not-a-trace" }],
    }),
    false,
  );
});
