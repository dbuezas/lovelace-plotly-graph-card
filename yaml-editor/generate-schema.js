import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildYamlSchema, registeredTraceTypes } from "./plotly-schema.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "..");
const schemaCli = path.join(
  directory,
  "node_modules/typescript-json-schema/bin/typescript-json-schema",
);

const cardSchema = JSON.parse(
  execFileSync(
    process.execPath,
    [schemaCli, "--required", "tsconfig.json", "JsonSchemaRoot"],
    {
      cwd: repository,
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    },
  ),
);
const plotlySchema = JSON.parse(
  fs.readFileSync(
    path.join(repository, "node_modules/plotly.js/dist/plot-schema.json"),
    "utf8",
  ),
);
const plotlySource = fs.readFileSync(
  path.join(repository, "src/plotly.ts"),
  "utf8",
);

const traces = registeredTraceTypes(plotlySource, plotlySchema);
const schema = buildYamlSchema(cardSchema, plotlySchema, traces);
const destination = path.join(directory, "src/schema.json");

fs.writeFileSync(destination, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Generated YAML schema for ${traces.length} Plotly trace types.`);
