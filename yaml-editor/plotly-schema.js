const EXPRESSION_REF = "#/definitions/PlotlyExpression";
const EXPRESSION_PATTERN = "^[\\s]*\\$(ex|fn)\\s[\\s\\S]+$";
const REPLACER_PATTERN = "^.*\\$ex\\$fn_REPLACER$";

const METADATA_KEYS = new Set([
  "anim",
  "arrayOk",
  "description",
  "dflt",
  "dimensions",
  "editType",
  "extras",
  "flags",
  "freeLength",
  "impliedEdits",
  "items",
  "max",
  "min",
  "noBlank",
  "role",
  "strict",
  "valType",
  "values",
]);

function expressionOr(schema) {
  return {
    anyOf: [{ $ref: EXPRESSION_REF }, schema],
  };
}

function inferType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function constantSchema(value) {
  return {
    const: value,
    type: inferType(value),
  };
}

function parseRegex(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  const finalSlash = value.lastIndexOf("/");
  return finalSlash > 0 ? value.slice(1, finalSlash) : undefined;
}

function valuesSchema(values = []) {
  const literals = [];
  const patterns = [];

  for (const value of values) {
    const pattern = parseRegex(value);
    if (pattern === undefined) literals.push(value);
    else patterns.push({ pattern, type: "string" });
  }

  const choices = [];
  if (literals.length > 0) choices.push({ enum: literals });
  choices.push(...patterns);

  if (choices.length === 0) return {};
  return choices.length === 1 ? choices[0] : { anyOf: choices };
}

function flaglistSchema(node) {
  const flags = node.flags || [];
  const combinations = [];
  for (let mask = 1; mask < 2 ** flags.length; mask += 1) {
    combinations.push(
      flags.filter((_, index) => mask & (1 << index)).join("+"),
    );
  }
  const suggestions = [...new Set([...(node.extras || []), ...combinations])];
  return {
    anyOf: [{ enum: suggestions }, { type: "string" }],
  };
}

function addNumericBounds(schema, node) {
  if (typeof node.min === "number") schema.minimum = node.min;
  if (typeof node.max === "number") schema.maximum = node.max;
  return schema;
}

function scalarSchema(node) {
  let schema;

  switch (node.valType) {
    case "boolean":
      schema = { type: "boolean" };
      break;
    case "integer":
      schema = addNumericBounds({ type: "integer" }, node);
      break;
    case "number":
    case "angle":
      schema = addNumericBounds({ type: "number" }, node);
      break;
    case "string":
    case "color":
    case "subplotid":
      schema = { type: "string" };
      if (node.noBlank) schema.minLength = 1;
      break;
    case "enumerated":
      schema = valuesSchema(node.values);
      break;
    case "flaglist":
      schema = flaglistSchema(node);
      break;
    case "data_array":
      schema = { type: "array", items: {} };
      break;
    case "colorlist":
      schema = { type: "array", items: { type: "string" } };
      break;
    case "colorscale":
      schema = {
        anyOf: [
          { type: "string" },
          {
            type: "array",
            items: {
              type: "array",
              items: [{ type: "number" }, { type: "string" }],
              additionalItems: false,
              minItems: 2,
              maxItems: 2,
            },
          },
        ],
      };
      break;
    case "info_array":
      schema = infoArraySchema(node);
      break;
    case "any":
    default:
      schema = {};
      break;
  }

  const regex = parseRegex(node.regex);
  if (regex !== undefined && schema.type === "string") schema.pattern = regex;

  const extras = valuesSchema(node.extras);
  if (Object.keys(extras).length > 0) {
    schema = { anyOf: [schema, extras] };
  }

  if (node.arrayOk && node.valType !== "data_array") {
    schema = {
      anyOf: [schema, { type: "array", items: schema }],
    };
  }

  return schema;
}

function isDescriptor(node) {
  return (
    node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    ("valType" in node || "role" in node || "items" in node)
  );
}

function infoArraySchema(node) {
  if (!node.items || typeof node.items !== "object") {
    return { type: "array", items: {} };
  }

  if (isDescriptor(node.items)) {
    return { type: "array", items: convertPlotlyNode(node.items) };
  }

  const entries = Object.entries(node.items);
  const tuple = entries.every(([key]) => /^\d+$/.test(key));
  if (!tuple) {
    const variants = entries.map(([, item]) => convertPlotlyNode(item));
    return {
      type: "array",
      items: variants.length === 1 ? variants[0] : { anyOf: variants },
    };
  }

  const items = entries
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, item]) => convertPlotlyNode(item));
  const schema = { type: "array", items };
  if (!node.freeLength) {
    schema.additionalItems = false;
    schema.minItems = items.length;
    schema.maxItems = items.length;
  }
  return schema;
}

function objectArraySchema(node) {
  const variants = Object.entries(node.items || {}).map(([, item]) =>
    convertPlotlyNode(item),
  );

  return {
    type: "array",
    items:
      variants.length === 1
        ? variants[0]
        : {
            anyOf: variants,
          },
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectSchema(attributes) {
  const properties = {};
  const patternProperties = {};

  for (const [name, attribute] of Object.entries(attributes)) {
    if (
      name.startsWith("_") ||
      (METADATA_KEYS.has(name) && !isDescriptor(attribute)) ||
      attribute === undefined
    ) {
      continue;
    }

    const converted = convertPlotlyNode(attribute);
    properties[name] = converted;

    if (attribute && typeof attribute === "object" && attribute._isSubplotObj) {
      patternProperties[`^${escapeRegex(name)}([2-9]|[1-9][0-9]+)$`] =
        converted;
    }
  }

  const schema = { type: "object", properties };
  if (Object.keys(patternProperties).length > 0) {
    schema.patternProperties = patternProperties;
  }
  return schema;
}

export function convertPlotlyNode(node) {
  if (node === null || typeof node !== "object") {
    return expressionOr(constantSchema(node));
  }

  let schema;
  if (node.role === "object" && node.items) {
    schema = objectArraySchema(node);
  } else if (node.role === "object") {
    schema = objectSchema(node);
  } else if (node.valType) {
    schema = scalarSchema(node);
  } else {
    schema = objectSchema(node);
  }

  if (typeof node.description === "string" && node.description.length > 0) {
    schema.description = node.description;
  }
  if (node.dflt !== undefined && node.dflt !== null) {
    schema.default = node.dflt;
  }

  return expressionOr(schema);
}

function decodePointerToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function definitionName(ref) {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Only local definition references are supported: ${ref}`);
  }
  return decodePointerToken(ref.slice(prefix.length));
}

function arrayVariant(schema) {
  if (schema?.type === "array") return schema;
  return schema?.anyOf?.find((variant) => variant.type === "array");
}

function patchEntityOffset(schema, cardEntityRef) {
  if (!cardEntityRef?.$ref) return;
  const definition = schema.definitions[definitionName(cardEntityRef.$ref)];
  if (!definition?.properties?.offset) return;

  definition.properties.offset = expressionOr({
    anyOf: [
      { type: "string" },
      { type: "number" },
      { type: "array", items: { type: "number" } },
    ],
  });
}

function collectDefinitionRefs(value, refs) {
  if (!value || typeof value !== "object") return;
  if (
    typeof value.$ref === "string" &&
    value.$ref.startsWith("#/definitions/")
  ) {
    refs.add(definitionName(value.$ref));
  }
  for (const child of Object.values(value)) collectDefinitionRefs(child, refs);
}

function pruneDefinitions(schema) {
  const definitions = schema.definitions || {};
  const root = { ...schema };
  delete root.definitions;

  const retained = new Set();
  collectDefinitionRefs(root, retained);

  const pending = [...retained];
  for (let index = 0; index < pending.length; index += 1) {
    const discovered = new Set();
    collectDefinitionRefs(definitions[pending[index]], discovered);
    for (const name of discovered) {
      if (!retained.has(name)) {
        retained.add(name);
        pending.push(name);
      }
    }
  }

  schema.definitions = Object.fromEntries(
    Object.entries(definitions).filter(([name]) => retained.has(name)),
  );
}

export function registeredTraceTypes(source, plotlySchema) {
  const traceSection = source
    .split("// traces", 2)[1]
    ?.split("// components", 1)[0];
  if (!traceSection) throw new Error("Could not find the Plotly trace section");

  const traces = ["scatter"];
  const pattern = /^\s*require\("plotly\.js\/lib\/([a-z0-9]+)"\),/gm;
  for (const match of traceSection.matchAll(pattern)) traces.push(match[1]);

  const unique = [...new Set(traces)];
  const missing = unique.filter((trace) => !plotlySchema.traces[trace]);
  if (missing.length > 0) {
    throw new Error(
      `Missing traces in Plotly runtime schema: ${missing.join(", ")}`,
    );
  }
  return unique;
}

function patchExpressionPlaceholders(value) {
  if (!value || typeof value !== "object") return;
  if (value.pattern === REPLACER_PATTERN) value.pattern = EXPRESSION_PATTERN;
  for (const child of Object.values(value)) patchExpressionPlaceholders(child);
}

function traceSubplot(trace) {
  for (const key of ["subplot", "geo", "scene"]) {
    const attribute = trace.attributes?.[key];
    if (
      attribute?.valType === "subplotid" &&
      typeof attribute.dflt === "string"
    ) {
      return attribute.dflt;
    }
  }
}

export function layoutAttributesFor(plotlySchema, traceTypes) {
  const attributes = structuredClone(plotlySchema.layout.layoutAttributes);
  const supportedSubplots = new Set(
    traceTypes.map((type) => traceSubplot(plotlySchema.traces[type])),
  );
  for (const trace of Object.values(plotlySchema.traces)) {
    const subplot = traceSubplot(trace);
    if (subplot && !supportedSubplots.has(subplot)) delete attributes[subplot];
  }
  for (const type of traceTypes) {
    const trace = plotlySchema.traces[type];
    if (!trace.layoutAttributes) continue;
    const subplot = traceSubplot(trace);
    // Polar bar options belong under layout.polar, not the Cartesian layout.
    const target = subplot ? (attributes[subplot] ||= {}) : attributes;
    Object.assign(target, structuredClone(trace.layoutAttributes));
  }
  return attributes;
}

export function configAttributesFor(plotlySchema, traceTypes) {
  const attributes = structuredClone(plotlySchema.config);
  const knownSubplots = new Set(
    Object.values(plotlySchema.traces).map(traceSubplot),
  );
  const supportedSubplots = new Set(
    traceTypes.map((type) => traceSubplot(plotlySchema.traces[type])),
  );
  const scrollZoom = attributes.scrollZoom;
  if (scrollZoom?.flags) {
    scrollZoom.flags = scrollZoom.flags.filter((flag) => {
      const subplot = flag === "gl3d" ? "scene" : flag;
      return !knownSubplots.has(subplot) || supportedSubplots.has(subplot);
    });
    if (typeof scrollZoom.dflt === "string") {
      scrollZoom.dflt =
        scrollZoom.dflt
          .split("+")
          .filter((flag) => scrollZoom.flags.includes(flag))
          .join("+") || false;
    }
  }
  if (!supportedSubplots.has("geo")) delete attributes.topojsonURL;
  return attributes;
}

export function buildYamlSchema(cardSchema, plotlySchema, traceTypes) {
  const schema = structuredClone(cardSchema);
  patchExpressionPlaceholders(schema);
  schema.definitions ||= {};
  schema.definitions.PlotlyExpression = {
    type: "string",
    pattern: EXPRESSION_PATTERN,
  };

  schema.definitions.PlotlyLayout = convertPlotlyNode(
    layoutAttributesFor(plotlySchema, traceTypes),
  );
  schema.definitions.PlotlyConfig = convertPlotlyNode(
    configAttributesFor(plotlySchema, traceTypes),
  );
  schema.definitions.PlotlyLayoutAxis = convertPlotlyNode(
    plotlySchema.layout.layoutAttributes.xaxis,
  );
  schema.definitions.PlotlyLayoutYAxis = convertPlotlyNode(
    plotlySchema.layout.layoutAttributes.yaxis ||
      plotlySchema.layout.layoutAttributes.xaxis,
  );

  const traceRefs = [];
  for (const traceType of traceTypes) {
    const name = `PlotlyTrace_${traceType}`;
    schema.definitions[name] = convertPlotlyNode(
      plotlySchema.traces[traceType].attributes,
    );
    traceRefs.push({ $ref: `#/definitions/${name}` });
  }
  schema.definitions.PlotlyTrace = { anyOf: traceRefs };

  const generatedEntities = arrayVariant(schema.properties.entities);
  if (!generatedEntities?.items) {
    throw new Error("Could not locate the generated entity item schema");
  }
  const cardEntityRef = generatedEntities.items;
  patchEntityOffset(schema, cardEntityRef);

  schema.properties.entities = expressionOr({
    type: "array",
    items: {
      allOf: [cardEntityRef, { $ref: "#/definitions/PlotlyTrace" }],
    },
  });
  schema.properties.layout = expressionOr({
    $ref: "#/definitions/PlotlyLayout",
  });
  schema.properties.config = expressionOr({
    $ref: "#/definitions/PlotlyConfig",
  });
  schema.properties.defaults = expressionOr({
    type: "object",
    properties: {
      entity: expressionOr({ $ref: "#/definitions/PlotlyTrace" }),
      xaxes: expressionOr({ $ref: "#/definitions/PlotlyLayoutAxis" }),
      yaxes: expressionOr({ $ref: "#/definitions/PlotlyLayoutYAxis" }),
    },
  });

  pruneDefinitions(schema);
  return schema;
}
