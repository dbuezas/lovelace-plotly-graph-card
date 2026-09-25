import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const assets = new Map();
for (const [name, entry] of [
  ["PlotlyTest", "src/plotly.ts"],
  ["DefaultsTest", "src/parse-config/defaults.ts"],
  ["CardTest", "src/plotly-graph-card.ts"],
]) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    globalName: name,
    outdir: "dist",
    minify: true,
  });
  assets.set(
    `/${name}.js`,
    result.outputFiles.find((file) => file.path.endsWith(".js")).text,
  );
}
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url.endsWith(".js") ? "text/javascript" : "text/html",
  );
  response.end(
    assets.get(request.url) ||
      `<!doctype html><body>
    <script src="/PlotlyTest.js"></script><script src="/DefaultsTest.js"></script>
    <script src="/CardTest.js"></script></body>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const Plotly = PlotlyTest.default;
    const results = [];
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const xy = { x: [1, 2, 3], y: [2, 1, 3] };
    const xyz = { ...xy, z: [1, 3, 2] };
    const hierarchy = {
      labels: ["A", "B", "C"],
      parents: ["", "A", "A"],
      values: [3, 1, 2],
    };
    const field = {
      x: [0, 1, 0, 1, 0, 1, 0, 1],
      y: [0, 0, 1, 1, 0, 0, 1, 1],
      z: [0, 0, 0, 0, 1, 1, 1, 1],
    };
    const carpet = {
      type: "carpet",
      a: [0, 1, 2],
      b: [0, 1, 2],
      y: [
        [0, 1, 2],
        [1, 2, 3],
        [2, 3, 4],
      ],
    };
    const fixtures = {
      scatter: xy,
      bar: xy,
      box: xy,
      violin: xy,
      histogram: { x: [1, 1, 2, 3] },
      histogram2d: xy,
      histogram2dcontour: xy,
      heatmap: {
        z: [
          [1, 2],
          [3, 4],
        ],
      },
      contour: {
        z: [
          [1, 2],
          [3, 4],
        ],
      },
      scatterternary: { a: [0.2, 0.4], b: [0.3, 0.3], c: [0.5, 0.3] },
      funnel: { x: [3, 2, 1], y: ["A", "B", "C"] },
      waterfall: xy,
      pie: { labels: ["A", "B"], values: [1, 2] },
      sunburst: hierarchy,
      treemap: hierarchy,
      icicle: hierarchy,
      funnelarea: { labels: ["A", "B"], values: [3, 2] },
      scatter3d: xyz,
      surface: {
        z: [
          [1, 2],
          [3, 4],
        ],
      },
      isosurface: { ...field, value: [0, 1, 2, 3, 1, 2, 3, 4] },
      volume: { ...field, value: [0, 1, 2, 3, 1, 2, 3, 4] },
      mesh3d: { ...xyz, i: [0], j: [1], k: [2] },
      cone: { ...xyz, u: [1, 1, 1], v: [1, 1, 1], w: [1, 1, 1] },
      streamtube: {
        ...field,
        u: Array(8).fill(1),
        v: Array(8).fill(1),
        w: Array(8).fill(1),
        starts: { x: [0], y: [0], z: [0] },
      },
      parcats: {
        dimensions: [
          { label: "A", values: ["a", "b"] },
          { label: "B", values: ["c", "d"] },
        ],
      },
      sankey: {
        node: { label: ["A", "B"] },
        link: { source: [0], target: [1], value: [2] },
      },
      indicator: { value: 42, mode: "number" },
      table: {
        cells: {
          values: [
            [1, 2],
            [3, 4],
          ],
        },
      },
      carpet,
      scattercarpet: { a: [0, 1, 2], b: [0, 1, 2] },
      contourcarpet: {
        a: [0, 1, 2],
        b: [0, 1, 2],
        z: [
          [1, 2, 3],
          [2, 3, 4],
          [3, 4, 5],
        ],
      },
      ohlc: {
        x: [1, 2],
        open: [2, 3],
        high: [4, 5],
        low: [1, 2],
        close: [3, 4],
      },
      candlestick: {
        x: [1, 2],
        open: [2, 3],
        high: [4, 5],
        low: [1, 2],
        close: [3, 4],
      },
      scatterpolar: { r: [1, 2, 3], theta: [0, 120, 240] },
      barpolar: { r: [1, 2, 3], theta: [0, 120, 240] },
      scattergeo: { lon: [7, 8], lat: [46, 47] },
      choropleth: {
        locations: ["test"],
        z: [1],
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "test",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [7, 46],
                    [8, 46],
                    [8, 47],
                    [7, 46],
                  ],
                ],
              },
            },
          ],
        },
      },
    };
    for (const [type, data] of Object.entries(fixtures)) {
      const div = document.createElement("div");
      document.body.append(div);
      const traces = ["scattercarpet", "contourcarpet"].includes(type)
        ? [carpet, { ...data, type }]
        : [{ ...data, type }];
      const layout = {
        width: 480,
        height: 285,
        geo: {
          showcoastlines: false,
          showland: false,
          showcountries: false,
          showlakes: false,
          showocean: false,
          showrivers: false,
          showframe: false,
          fitbounds: false,
          lataxis: { range: [45, 48] },
          lonaxis: { range: [6, 9] },
        },
      };
      try {
        await Plotly.newPlot(div, traces, layout, { showSendToCloud: false });
        check(
          div._fullData.at(-1).type === type,
          `${type}: silently fell back to another trace`,
        );
        check(
          div._fullData.at(-1).visible !== false,
          `${type}: invisible trace`,
        );
        check(div.querySelector("svg"), `${type}: no rendered SVG`);
        await Plotly.react(
          div,
          traces,
          { ...layout, width: 360 },
          { showSendToCloud: false },
        );
        check(div._fullLayout.width === 360, `${type}: resize/react failed`);
        results.push(type);
      } finally {
        Plotly.purge(div);
        div.remove();
      }
    }
    const div = document.createElement("div");
    document.body.append(div);
    const defaults = DefaultsTest.addPostParsingDefaults({
      entities: [],
      visible_range: [0, 4],
      raw_plotly_config: false,
      config: {},
      layout: {
        width: 480,
        height: 285,
        yaxis2: { overlaying: "y", side: "right" },
        shapes: [
          {
            type: "path",
            path: "M 0,0 L 0,2 Q 1,3 2,2 L 2,0 Z",
            fillcolor: "rgba(52,152,219,0.82)",
          },
        ],
        annotations: [{ x: 1, y: 1, text: "<b>900 L</b>", showarrow: false }],
      },
    });
    await Plotly.newPlot(
      div,
      [
        { ...xy, type: "scatter" },
        { ...xy, type: "bar", yaxis: "y2" },
      ],
      defaults.layout,
      defaults.config,
    );
    check(
      div._fullLayout.yaxis2.tickmode === "sync",
      "Overlaid axis did not use Plotly's synchronized-tick default",
    );
    check(
      div._context.showSendToCloud === false,
      "Cloud upload unexpectedly enabled",
    );
    check(
      !div.querySelector('[data-title*="Cloud"]'),
      "Cloud upload button visible",
    );
    check(div.querySelector(".shapelayer path"), "Tank shape missing");
    check(
      div.querySelector(".annotation-text").textContent === "900 L",
      "Tank label missing",
    );
    await Plotly.relayout(div, { "yaxis.autorange": true });
    check(div._fullLayout.yaxis.autorange, "Dotted relayout failed");
    const axisCases = [
      { name: "single axis", single: true, axis: {}, mode: "auto" },
      { name: "non-overlaid axis", axis: { overlaying: false }, mode: "auto" },
      {
        name: "raw overlaid axis",
        raw: true,
        axis: { overlaying: "y" },
        mode: "sync",
      },
      {
        name: "explicit independent ticks",
        axis: { overlaying: "y", tickmode: "auto" },
        mode: "auto",
      },
      {
        name: "inferred array ticks",
        axis: { overlaying: "y", tickvals: [1, 2, 3] },
        mode: "array",
      },
      {
        name: "inferred linear ticks",
        axis: { overlaying: "y", dtick: 1 },
        mode: "linear",
      },
      {
        name: "categorical overlaid axis",
        axis: { overlaying: "y", type: "category" },
        mode: "auto",
      },
    ];
    for (const test of axisCases) {
      const input = DefaultsTest.addPostParsingDefaults({
        entities: [],
        visible_range: [0, 4],
        raw_plotly_config: !!test.raw,
        config: {},
        layout: { width: 480, height: 285, yaxis2: test.axis },
      });
      const traces = [{ ...xy, type: "scatter" }];
      if (!test.single) traces.push({ ...xy, type: "scatter", yaxis: "y2" });
      await Plotly.react(div, traces, input.layout, input.config);
      const axis = div._fullLayout[test.single ? "yaxis" : "yaxis2"];
      check(
        axis.tickmode === test.mode,
        `${test.name}: expected ${test.mode}, got ${axis.tickmode}`,
      );
      results.push(test.name);
    }
    Plotly.purge(div);
    div.remove();
    results.push("axes, privacy, tank shapes, annotations, relayout");
    return { version: Plotly.version, results };
  });
  const source = await readFile("src/plotly.ts", "utf8");
  const expected = [
    ...source.matchAll(/^\s*require\("plotly\.js\/lib\/([^/".]+)"\)/gm),
  ]
    .map((match) => match[1])
    .filter((name) => name !== "calendars");
  for (const type of ["scatter", ...expected])
    assert(results.results.includes(type), `Missing browser fixture: ${type}`);
  assert.equal(results.version, "4.1.1");
  await page.evaluate(() => {
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
        }
      },
    );
    const card = new CardTest.PlotlyGraph();
    card.id = "card-under-test";
    card.style.cssText =
      "display:block;width:480px;--card-background-color:white;--primary-background-color:white;--primary-color:blue;--primary-text-color:black;--secondary-text-color:gray";
    card.hass = {
      states: {},
      locale: { language: "en", first_weekday: "monday" },
      config: { time_zone: "Europe/Zurich" },
      themes: { darkMode: false },
    };
    card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      hours_to_show: "24h",
      config: { displayModeBar: true },
      entities: [
        {
          entity: "",
          x: [Date.now() - 3600000, Date.now()],
          y: [10, 20],
          name: "Test power",
          unit_of_measurement: "W",
        },
      ],
    });
    document.body.append(card);
  });
  await page.waitForFunction(() => {
    const card = document.getElementById("card-under-test");
    return (
      card.contentEl?._fullData?.length === 1 &&
      card.contentEl.style.visibility === ""
    );
  });
  const cardState = await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    return {
      error: card.errorMsgEl.textContent,
      title: card.contentEl._fullLayout.yaxis.title.text,
      upload: card.contentEl._context.showSendToCloud,
      height: card.contentEl._fullLayout.height,
    };
  });
  assert.equal(cardState.error, "");
  assert.equal(cardState.title, "W");
  assert.equal(cardState.upload, false);
  assert.equal(cardState.height, 285);
  await page.evaluate(() => {
    document.getElementById("card-under-test").style.width = "320px";
  });
  await page.waitForFunction(() => {
    const card = document.getElementById("card-under-test");
    return card.contentEl._fullLayout.width <= 320;
  });
  results.results.push("Lovelace card with mock HA state");
  const retention = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const entity = "sensor.retention";
    window.cacheNow = Math.floor(Date.now() / 1000) * 1000 - 120000;
    card.hass = {
      ...card.hass,
      states: {
        [entity]: {
          entity_id: entity,
          state: "1",
          attributes: {},
          last_updated: new Date(window.cacheNow).toISOString(),
          last_changed: new Date(window.cacheNow).toISOString(),
        },
      },
      callApi: async (_method, uri) => {
        const [path, query] = uri.split("?");
        const start = Date.parse(path.replace("history/period/", ""));
        const end = Date.parse(new URLSearchParams(query).get("end_time"));
        const timestamps = [start];
        for (let t = Math.ceil(start / 1000) * 1000; t <= end; t += 1000)
          timestamps.push(t);
        return [
          timestamps.map((timestamp) => ({
            entity_id: entity,
            state: String(timestamp),
            attributes: {},
            last_updated: new Date(timestamp).toISOString(),
            last_changed: new Date(timestamp).toISOString(),
          })),
        ];
      },
    };
    await card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: "$fn () => [window.cacheNow - 60000, window.cacheNow]",
      entities: [{ entity, extend_to_present: false }],
    });
    let maxPoints = 0;
    for (let i = 0; i < 20; i++) {
      window.cacheNow += 1000;
      await card.plot({ should_fetch: true });
      if (card.errorMsgEl.textContent)
        throw new Error(card.errorMsgEl.textContent);
      const history = card.configParser.cache.histories[entity];
      maxPoints = Math.max(maxPoints, history.length);
      if (+history[0].x !== window.cacheNow - 60000)
        throw new Error("Cache start did not advance");
      if (card.contentEl.data[0].y.at(-1) !== String(window.cacheNow))
        throw new Error("Latest sample missing");
    }
    return { maxPoints, plottedPoints: card.contentEl.data[0].y.length };
  });
  assert.equal(retention.maxPoints, 61);
  assert.equal(retention.plottedPoints, 61);
  results.results.push(
    "rolling dynamic range keeps 61 samples across 20 card refreshes",
  );
  assert.deepEqual(errors, []);
  console.log(
    `Plotly ${results.version}: ${results.results.length} browser checks passed`,
  );
  console.log(results.results.join(", "));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
