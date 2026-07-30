import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TraceCase = {
  name: string;
  trace: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

const emptyMapStyle = {
  version: 8,
  sources: {},
  layers: [],
};

const mapLayout = {
  map: {
    style: emptyMapStyle,
    center: { lon: 8.55, lat: 47.37 },
    zoom: 6,
  },
};

const traceCases: TraceCase[] = [
  {
    name: "scattergl",
    trace: {
      type: "scattergl",
      mode: "lines+markers",
      x: [1, 2, 3],
      y: [1, 3, 2],
    },
  },
  {
    name: "splom",
    trace: {
      type: "splom",
      dimensions: [
        { label: "Temperature", values: [18, 21, 24] },
        { label: "Humidity", values: [45, 52, 48] },
      ],
    },
  },
  {
    name: "parcoords",
    trace: {
      type: "parcoords",
      line: { color: [1, 2, 3] },
      dimensions: [
        { label: "Power", values: [1, 3, 2] },
        { label: "Voltage", values: [220, 230, 225] },
      ],
    },
  },
  {
    name: "scattermap",
    trace: {
      type: "scattermap",
      mode: "markers",
      lat: [47.37, 47.4],
      lon: [8.54, 8.58],
      marker: { size: [12, 16] },
    },
    layout: mapLayout,
  },
  {
    name: "choroplethmap",
    trace: {
      type: "choroplethmap",
      locations: ["test-area"],
      z: [1],
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "test-area",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [8.4, 47.3],
                  [8.7, 47.3],
                  [8.7, 47.5],
                  [8.4, 47.5],
                  [8.4, 47.3],
                ],
              ],
            },
          },
        ],
      },
    },
    layout: mapLayout,
  },
  {
    name: "densitymap",
    trace: {
      type: "densitymap",
      lat: [47.36, 47.38, 47.4],
      lon: [8.52, 8.55, 8.58],
      z: [1, 3, 2],
      radius: 20,
    },
    layout: mapLayout,
  },
  {
    name: "scatterpolargl",
    trace: {
      type: "scatterpolargl",
      mode: "lines+markers",
      r: [1, 2, 1.5],
      theta: [0, 120, 240],
    },
  },
  {
    name: "scattersmith",
    trace: {
      type: "scattersmith",
      mode: "lines+markers",
      real: [0.5, 1, 2],
      imag: [-0.5, 0, 0.5],
    },
  },
];

let bundleDirectory: string;
let bundlePath: string;
let stylesheetPath: string;

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(path.join(tmpdir(), "plotly-traces-"));
  bundlePath = path.join(bundleDirectory, "plotly-test.js");
  stylesheetPath = path.join(bundleDirectory, "plotly-test.css");

  await build({
    entryPoints: [path.resolve(__dirname, "plotly-test-entry.ts")],
    bundle: true,
    format: "iife",
    minify: true,
    outfile: bundlePath,
    platform: "browser",
  });
});

test.afterAll(async () => {
  await rm(bundleDirectory, { force: true, recursive: true });
});

test("renders every newly registered trace type", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setContent("<main id=\"plots\"></main>");
  await page.addScriptTag({ path: bundlePath });

  try {
    await access(stylesheetPath);
    await page.addStyleTag({ path: stylesheetPath });
  } catch {
    // Some Plotly builds do not emit a separate stylesheet.
  }

  const results = await page.evaluate(async (cases) => {
    const Plotly = window.PlotlyTest;
    const plots = document.querySelector("#plots")!;
    const output: {
      name: string;
      error?: string;
      rendered?: boolean;
      validation: string[];
    }[] = [];

    for (const traceCase of cases) {
      const plot = document.createElement("div");
      plot.style.width = "640px";
      plot.style.height = "420px";
      plots.append(plot);

      const layout = {
        width: 640,
        height: 420,
        margin: { l: 40, r: 40, t: 40, b: 40 },
        ...traceCase.layout,
      };
      const validation = (Plotly.validate(
        [traceCase.trace] as Plotly.Data[],
        layout as Partial<Plotly.Layout>,
      ) || []).map(({ msg }) => msg);

      try {
        await Plotly.newPlot(
          plot,
          [traceCase.trace] as Plotly.Data[],
          layout as Partial<Plotly.Layout>,
          { staticPlot: true },
        );
        const rendered =
          (plot as unknown as Plotly.PlotlyHTMLElement).data[0]?.type ===
          traceCase.name;
        output.push({ name: traceCase.name, rendered, validation });
      } catch (error) {
        output.push({
          name: traceCase.name,
          error: error instanceof Error ? error.message : String(error),
          validation,
        });
      } finally {
        Plotly.purge(plot);
        plot.remove();
      }
    }

    return output;
  }, traceCases);

  expect(pageErrors).toEqual([]);
  expect(results).toEqual(
    traceCases.map(({ name }) => ({
      name,
      rendered: true,
      validation: [],
    })),
  );
});
