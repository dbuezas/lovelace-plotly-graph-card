// Builds the card with Rolldown.
//   node build.mjs          production build into dist/
//   node build.mjs --watch  development build on every change (bun run start)
// The browser tests import cardInputOptions to bundle the same way.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { rolldown, watch } from "rolldown";

// `import css from "x.css?raw"` gives the file content as text
const raw = {
  name: "raw",
  async resolveId(source, importer) {
    if (!source.endsWith("?raw")) return;
    const resolved = await this.resolve(source.slice(0, -4), importer);
    return resolved && `${resolved.id}?raw`;
  },
  load(id) {
    if (id.endsWith("?raw"))
      return {
        code: readFileSync(id.slice(0, -4), "utf8"),
        moduleType: "text",
      };
  },
};

// Modules that Plotly's core (src/plotly.ts) always needs, found once the
// module graph is known. They go into one chunk with it: fewer files to
// download, and fewer requests that can fail on a flaky connection.
const plotlyCore = new Set();
const findPlotlyCore = {
  name: "find-plotly-core",
  buildEnd() {
    const visit = (id) => {
      if (plotlyCore.has(id)) return;
      plotlyCore.add(id);
      this.getModuleInfo(id)?.importedIds.forEach(visit);
    };
    const entry = [...this.getModuleIds()].find((id) =>
      id.endsWith("/src/plotly.ts"),
    );
    if (entry) visit(entry);
  },
};

export const cardInputOptions = ({ production = true, input } = {}) => ({
  input: input ?? { "plotly-graph-card": "src/plotly-graph-card.ts" },
  platform: "browser",
  // Plotly imports MapLibre's CSS; the map group loads it as text instead
  moduleTypes: { ".css": "empty" },
  plugins: [raw, findPlotlyCore],
  onLog(level, log, handler) {
    // bit-twiddle has a harmless typo: "use restrict"
    if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
  },
  transform: {
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        production ? "production" : "development",
      ),
    },
    // Some dependencies (the stream polyfill of the image trace) expect
    // Node's `process`; it is imported only into the files that use it
    inject: { process: "process/browser" },
  },
});

export const cardOutputOptions = ({ production = true } = {}) => ({
  dir: "dist",
  format: "es",
  entryFileNames: "[name].js",
  chunkFileNames: "[name]-[hash].js",
  minify: production,
  // HA loads the card file with a query (?hacstag=...). If other chunks
  // imported it without that query, the browser would run it twice, so the
  // card file only loads a chunk with everything it needs.
  codeSplitting: {
    groups: [
      { name: "card", tags: ["$initial"], priority: 2 },
      { name: "plotly", test: (id) => plotlyCore.has(id), priority: 1 },
    ],
  },
  sourcemap: production ? false : "inline",
});

// For the browser tests: bundles in memory, either split like the release or
// as one script (format "iife") that sets `globalThis[name]`. `code` is used
// as the entry source instead of `input` when given.
export const bundleInMemory = async ({ input, code, name, split = false }) => {
  const options = cardInputOptions({ input: code ? "entry" : input });
  if (code)
    options.plugins.push({
      name: "entry",
      resolveId(source, importer) {
        if (source === "entry") return source;
        if (importer === "entry") return this.resolve(resolve(source));
      },
      load: (id) => (id === "entry" ? { code, moduleType: "ts" } : undefined),
    });
  const bundle = await rolldown(options);
  const { output } = await bundle.generate(
    split
      ? cardOutputOptions()
      : { format: "iife", name, codeSplitting: false, minify: true },
  );
  await bundle.close();
  return output;
};

// Development: rebuild on change, serve dist/ on port 8000 with CORS
const serve = () =>
  createServer((request, response) => {
    const file = join("dist", new URL(request.url, "http://x").pathname);
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (!existsSync(file) || !file.endsWith(".js"))
      return response.writeHead(404).end();
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(readFileSync(file));
  }).listen(8000, () => console.log("serving http://localhost:8000/"));

if (import.meta.url === `file://${process.argv[1]}`) {
  const production = !process.argv.includes("--watch");
  const options = {
    ...cardInputOptions({ production }),
    output: cardOutputOptions({ production }),
  };
  rmSync("dist", { recursive: true, force: true });
  if (production) {
    const bundle = await rolldown(options);
    await bundle.write(options.output);
    await bundle.close();
  } else {
    serve();
    watch(options).on("event", (event) => {
      if (event.code === "BUNDLE_END")
        console.log(`built in ${event.duration} ms`);
      if (event.code === "ERROR") console.error(event.error.message);
      if (event.result) event.result.close();
    });
  }
}
