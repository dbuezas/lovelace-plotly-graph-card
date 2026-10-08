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
  const stylesheet = result.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  );
  if (stylesheet) assets.set(`/${name}.css`, stylesheet.text);
}
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url.endsWith(".js")
      ? "text/javascript"
      : request.url.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  response.end(
    assets.get(request.url) ||
      `<!doctype html><link rel="stylesheet" href="/PlotlyTest.css"><body>
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
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
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
    const modernTypes = [
      "scattergl",
      "splom",
      "parcoords",
      "scatterpolargl",
      "scattersmith",
    ];
    const fixtures = {
      scatter: xy,
      scattergl: { ...xy, mode: "lines+markers" },
      splom: {
        dimensions: [
          { label: "Temperature", values: [18, 21, 24] },
          { label: "Humidity", values: [45, 52, 48] },
        ],
      },
      parcoords: {
        line: { color: [1, 2, 3] },
        dimensions: [
          { label: "Power", values: [1, 3, 2] },
          { label: "Voltage", values: [220, 230, 225] },
        ],
      },
      scatterpolargl: {
        mode: "lines+markers",
        r: [1, 2, 1.5],
        theta: [0, 120, 240],
      },
      scattersmith: {
        mode: "lines+markers",
        real: [0.5, 1, 2],
        imag: [-0.5, 0, 0.5],
      },
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
    window.modernTraceCases = modernTypes.map((type) => ({
      type,
      data: fixtures[type],
    }));
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
        if (modernTypes.includes(type)) {
          const validation =
            Plotly.validate(traces, {
              width: layout.width,
              height: layout.height,
            }) || [];
          check(!validation.length, `${type}: ${JSON.stringify(validation)}`);
        }
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
        if (modernTypes.includes(type) && type !== "scattersmith") {
          check(div.querySelector("canvas"), `${type}: no rendered canvas`);
        }
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
    for (const test of [
      {
        name: "both editor bounds",
        min_y_axis: 300,
        max_y_axis: 1500,
        expected: [300, 1500],
        autorange: false,
      },
      {
        name: "editor minimum only",
        min_y_axis: 300,
        expected: [300, null],
        autorange: "max",
      },
      {
        name: "editor maximum only",
        max_y_axis: 1500,
        expected: [null, 1500],
        autorange: "min",
      },
      {
        name: "zero editor minimum",
        min_y_axis: 0,
        expected: [0, null],
        autorange: "max",
      },
      {
        name: "zero editor maximum",
        max_y_axis: 0,
        expected: [null, 0],
        autorange: "min",
        values: [-600, -1000],
      },
      {
        name: "explicit range overrides editor",
        min_y_axis: 300,
        max_y_axis: 1500,
        axis: { range: [400, 1200] },
        expected: [400, 1200],
        autorange: false,
      },
      {
        name: "explicit autorange overrides editor",
        min_y_axis: 300,
        max_y_axis: 1500,
        axis: { autorange: true },
        expected: [null, null],
        autorange: true,
      },
      {
        name: "logarithmic editor bounds use data units",
        min_y_axis: 300,
        max_y_axis: 1500,
        axis: { type: "log" },
        expected: [Math.log10(300), Math.log10(1500)],
        autorange: false,
      },
      {
        name: "editor logarithmic scale toggle",
        min_y_axis: 300,
        max_y_axis: 1500,
        logarithmic_scale: true,
        expected: [Math.log10(300), Math.log10(1500)],
        autorange: false,
      },
      {
        name: "invalid logarithmic minimum is ignored",
        min_y_axis: 0,
        max_y_axis: 1500,
        logarithmic_scale: true,
        expected: [null, Math.log10(1500)],
        autorange: "min",
      },
      {
        name: "inverted editor bounds are ignored",
        min_y_axis: 1500,
        max_y_axis: 300,
        expected: [null, null],
        autorange: true,
      },
      {
        name: "editor minimum above all data stays ascending",
        min_y_axis: 2000,
        expected: [null, null],
        autorange: true,
      },
      {
        name: "editor maximum below all data stays ascending",
        max_y_axis: 300,
        expected: [null, null],
        autorange: true,
      },
      {
        name: "logarithmic minimum above all data stays ascending",
        min_y_axis: 2000,
        logarithmic_scale: true,
        expected: [null, null],
        autorange: true,
      },
      {
        name: "fit data includes editor bounds and data outside them",
        min_y_axis: 300,
        max_y_axis: 1500,
        fit_y_data: true,
        values: [100, 2000],
        includes: [100, 300, 1500, 2000],
        expected: [null, null],
        autorange: true,
      },
      {
        name: "logarithmic fit includes bounds in data units",
        min_y_axis: 300,
        max_y_axis: 1500,
        fit_y_data: true,
        logarithmic_scale: true,
        includes: [300, 1500],
        expected: [null, null],
        autorange: false,
      },
      {
        name: "logarithmic fit supports bounds below one",
        min_y_axis: 0.01,
        max_y_axis: 2,
        fit_y_data: true,
        logarithmic_scale: true,
        values: [0.2, 0.7],
        includes: [0.01, 0.2, 0.7, 2],
        expected: [null, null],
        autorange: false,
      },
      {
        name: "logarithmic fit never clips data outside the bounds",
        min_y_axis: 300,
        max_y_axis: 1500,
        fit_y_data: true,
        logarithmic_scale: true,
        values: [100, 2000],
        includes: [100, 300, 1500, 2000],
        expected: [null, null],
        autorange: true,
      },
      {
        name: "explicit Plotly type overrides editor logarithmic toggle",
        min_y_axis: 300,
        max_y_axis: 1500,
        logarithmic_scale: true,
        axis: { type: "linear" },
        expected: [300, 1500],
        autorange: false,
      },
      {
        name: "explicit range overrides fit data",
        min_y_axis: 300,
        max_y_axis: 1500,
        fit_y_data: true,
        axis: { range: [400, 1200] },
        expected: [400, 1200],
        autorange: false,
      },
    ]) {
      const input = DefaultsTest.addPostParsingDefaults({
        entities: [],
        visible_range: [0, 4],
        raw_plotly_config: false,
        min_y_axis: test.min_y_axis,
        max_y_axis: test.max_y_axis,
        fit_y_data: test.fit_y_data,
        logarithmic_scale: test.logarithmic_scale,
        config: {},
        layout: { width: 480, height: 285, yaxis: test.axis || {} },
      });
      await Plotly.react(
        div,
        [{ type: "scatter", x: [1, 2], y: test.values || [600, 1000] }],
        input.layout,
        input.config,
      );
      const editorUpdate = DefaultsTest.getEditorYAxisRelayout(
        input,
        div.layout.yaxis.range,
      );
      if (editorUpdate) await Plotly.relayout(div, editorUpdate);
      const axis = div._fullLayout.yaxis;
      check(axis.autorange === test.autorange, `${test.name}: wrong autorange`);
      check(axis.range[0] < axis.range[1], `${test.name}: reversed range`);
      test.expected.forEach((bound, index) => {
        if (bound !== null)
          check(
            axis.range[index] === bound,
            `${test.name}: wrong bound ${index}`,
          );
      });
      for (const value of test.includes || []) {
        const coordinate = axis.type === "log" ? Math.log10(value) : value;
        check(
          axis.range[0] <= coordinate + 1e-10 &&
            axis.range[1] >= coordinate - 1e-10,
          `${test.name}: ${value} is outside ${JSON.stringify(axis.range)} (update ${JSON.stringify(editorUpdate)})`,
        );
      }
      results.push(test.name);
    }
    for (const test of [
      {
        name: "disabled log toggle keeps numeric auto-detection",
        values: [10, 100],
        type: "linear",
      },
      {
        name: "disabled log toggle keeps category auto-detection",
        values: ["off", "on"],
        type: "category",
      },
      {
        name: "disabled log toggle keeps date auto-detection",
        values: ["2026-10-01", "2026-10-02"],
        type: "date",
      },
    ]) {
      const traces = [{ type: "scatter", x: [1, 2], y: test.values }];
      const logarithmic = DefaultsTest.addPostParsingDefaults({
        entities: [],
        visible_range: [0, 4],
        raw_plotly_config: false,
        logarithmic_scale: true,
        config: {},
        layout: { width: 480, height: 285 },
      });
      await Plotly.react(
        div,
        [{ type: "scatter", x: [1, 2], y: [10, 100] }],
        logarithmic.layout,
        logarithmic.config,
      );
      const automatic = DefaultsTest.addPostParsingDefaults({
        entities: [],
        visible_range: [0, 4],
        raw_plotly_config: false,
        logarithmic_scale: false,
        config: {},
        layout: { width: 480, height: 285 },
      });
      await Plotly.react(div, traces, automatic.layout, automatic.config);
      check(
        div._fullLayout.yaxis.type === test.type,
        `${test.name}: got ${div._fullLayout.yaxis.type}`,
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
  assert.equal(results.version, "4.1.2");
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
  const editorCardCases = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const cases = [
      {
        name: "card logarithmic editor toggle",
        logarithmic_scale: true,
        expected: [Math.log10(300), Math.log10(1500)],
      },
      {
        name: "card logarithmic fit",
        logarithmic_scale: true,
        fit_y_data: true,
        includes: [300, 600, 1000, 1500],
      },
      {
        name: "card scroll autorange overrides fixed editor bounds",
        autorange_after_scroll: true,
        automatic: true,
      },
      {
        name: "card scroll autorange ignores invalid partial bounds",
        min_y_axis: 2000,
        max_y_axis: undefined,
        autorange_after_scroll: true,
        automatic: true,
      },
      {
        name: "card scroll autorange retains linear fit bounds",
        fit_y_data: true,
        autorange_after_scroll: true,
        includes: [300, 600, 1000, 1500],
      },
      {
        name: "card scroll autorange retains logarithmic fit bounds",
        logarithmic_scale: true,
        fit_y_data: true,
        autorange_after_scroll: true,
        includes: [300, 600, 1000, 1500],
      },
      {
        name: "card invalid partial bound falls back to autorange",
        min_y_axis: 2000,
        max_y_axis: undefined,
        automatic: true,
      },
    ];
    for (const test of cases) {
      const { name, expected, includes, automatic, ...options } = test;
      const now = Date.now();
      await card.setConfig({
        type: "custom:plotly-graph",
        refresh_interval: 0,
        min_y_axis: 300,
        max_y_axis: 1500,
        ...options,
        entities: [{ entity: "", x: [now - 60000, now], y: [600, 1000] }],
      });
      await card.plot({ should_fetch: false });
      if (card.errorMsgEl.textContent)
        throw new Error(`${name}: ${card.errorMsgEl.textContent}`);
      const axis = card.contentEl._fullLayout.yaxis;
      if (!(axis.range[0] < axis.range[1]))
        throw new Error(`${name}: reversed range`);
      if (
        expected &&
        expected.some(
          (value, index) => Math.abs(value - axis.range[index]) > 1e-10,
        )
      )
        throw new Error(`${name}: wrong range`);
      if (automatic && axis.autorange !== true)
        throw new Error(`${name}: not automatic`);
      if (automatic && (axis.range[0] === 300 || axis.range[1] === 1500))
        throw new Error(`${name}: fixed editor bounds still applied`);
      for (const value of includes || []) {
        const coordinate = axis.type === "log" ? Math.log10(value) : value;
        if (
          coordinate < axis.range[0] - 1e-10 ||
          coordinate > axis.range[1] + 1e-10
        )
          throw new Error(`${name}: ${value} is outside the fitted range`);
      }
    }
    return cases.map(({ name }) => name);
  });
  results.results.push(...editorCardCases);
  const automaticCardCases = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const cases = [
      { values: ["off", "on"], type: "category" },
      { values: ["2026-10-01", "2026-10-02"], type: "date" },
    ];
    for (const test of cases) {
      const now = Date.now();
      const config = {
        type: "custom:plotly-graph",
        refresh_interval: 0,
        entities: [{ entity: "", x: [now - 60000, now], y: [10, 100] }],
      };
      await card.setConfig({ ...config, logarithmic_scale: true });
      await card.plot({ should_fetch: false });
      await card.setConfig({
        ...config,
        logarithmic_scale: false,
        entities: [{ entity: "", x: [now - 60000, now], y: test.values }],
      });
      await card.plot({ should_fetch: false });
      if (card.errorMsgEl.textContent)
        throw new Error(card.errorMsgEl.textContent);
      if (card.contentEl._fullLayout.yaxis.type !== test.type)
        throw new Error(
          `card disabled log toggle: expected ${test.type}, got ${card.contentEl._fullLayout.yaxis.type}`,
        );
    }
    return cases.map(
      ({ type }) => `card disabled log toggle restores ${type} auto-detection`,
    );
  });
  results.results.push(...automaticCardCases);
  const themeColors = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    document.documentElement.style.setProperty("--accent-color", "#123456");
    card.style.setProperty("--error-color", "#654321");
    const config = {
      type: "custom:plotly-graph",
      refresh_interval: 0,
      entities: [
        {
          entity: "",
          x: [1, 2],
          y: [1, 2],
          line: { color: "$ex css_vars['accent-color']" },
        },
        {
          entity: "",
          x: [1, 2],
          y: [2, 3],
          line: { color: "$fn ({ css_vars }) => css_vars['error-color']" },
        },
      ],
    };
    await card.setConfig(config);
    await card.plot({ should_fetch: false });
    const initial = card.contentEl._fullData.map((trace) => trace.line.color);
    document.documentElement.style.setProperty("--accent-color", "#abcdef");
    card.style.setProperty("--error-color", "#fedcba");
    await card.plot({ should_fetch: false });
    const changed = card.contentEl._fullData.map((trace) => trace.line.color);
    await card.setConfig({ ...config, ha_theme: false });
    await card.plot({ should_fetch: false });
    const noTheme = card.contentEl._fullData.map((trace) => trace.line.color);
    document.documentElement.style.removeProperty("--accent-color");
    card.style.removeProperty("--error-color");
    return { initial, changed, noTheme, error: card.errorMsgEl.textContent };
  });
  assert.equal(themeColors.error, "");
  assert.deepEqual(themeColors.initial, ["#123456", "#654321"]);
  assert.deepEqual(themeColors.changed, ["#abcdef", "#fedcba"]);
  assert.deepEqual(themeColors.noTheme, ["#abcdef", "#fedcba"]);
  results.results.push(
    "theme colors resolve through $ex/$fn and update on render",
  );
  results.results.push("theme colors remain available with ha_theme disabled");
  const barColors = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const bar = { entity: "", type: "bar", x: [1, 2], y: [1, 2] };
    const rendered = [];
    for (const fixture of [
      {
        label: "named palette",
        color_scheme: "dark2",
        entities: [bar],
        expected: ["#1b9e77"],
      },
      {
        label: "numeric palette",
        color_scheme: 0,
        entities: [bar],
        expected: ["#7fc97f"],
      },
      {
        label: "mixed traces and explicit per-bar colors",
        color_scheme: ["#112233", "#445566", "#778899"],
        entities: [
          { ...bar, type: "scatter" },
          bar,
          { ...bar, marker: { color: ["red", "blue"] } },
        ],
        expected: ["#445566", ["red", "blue"]],
      },
      {
        label: "explicit Plotly palette",
        color_scheme: "dark2",
        layout: { colorway: ["purple", "orange"] },
        entities: [bar],
        expected: ["purple"],
      },
      {
        label: "Plotly template palette",
        color_scheme: "dark2",
        layout: { template: { layout: { colorway: ["purple", "orange"] } } },
        entities: [bar],
        expected: ["purple"],
      },
      {
        label: "raw Plotly defaults",
        color_scheme: "dark2",
        raw_plotly_config: true,
        entities: [bar],
        expected: ["#1f77b4"],
      },
    ]) {
      await card.setConfig({
        type: "custom:plotly-graph",
        refresh_interval: 0,
        color_scheme: fixture.color_scheme,
        raw_plotly_config: fixture.raw_plotly_config ?? false,
        layout: { xaxis: { type: "linear", range: [0, 3] }, ...fixture.layout },
        entities: fixture.entities,
      });
      await card.plot({ should_fetch: false });
      if (card.errorMsgEl.textContent)
        throw new Error(card.errorMsgEl.textContent);
      const colors = card.contentEl._fullData
        .filter((trace) => trace.type === "bar")
        .map((trace) => trace.marker.color);
      if (JSON.stringify(colors) !== JSON.stringify(fixture.expected)) {
        throw new Error(
          `Incorrect bar colors for ${fixture.label}: ${JSON.stringify(colors)}`,
        );
      }
      const paths = [
        ...card.contentEl.querySelectorAll(".barlayer .point path"),
      ];
      if (
        paths.length !== fixture.expected.length * 2 ||
        paths.some((path) => !path.getAttribute("d"))
      ) {
        throw new Error(`Bars did not render for ${fixture.label}`);
      }
      const fills = fixture.expected.flatMap((color) =>
        Array.isArray(color) ? color : [color, color],
      );
      for (const [index, color] of fills.entries()) {
        const colorProbe = document.createElement("span");
        colorProbe.style.color = color;
        document.body.append(colorProbe);
        const expectedFill = getComputedStyle(colorProbe).color;
        colorProbe.remove();
        if (getComputedStyle(paths[index]).fill !== expectedFill) {
          throw new Error(
            `Rendered fill differs from palette for ${fixture.label}`,
          );
        }
      }
      rendered.push(`bar color scheme: ${fixture.label}`);
    }
    return rendered;
  });
  results.results.push(...barColors);
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
      callWS: async (request) => {
        if (request.type !== "history/history_during_period")
          throw new Error("Unexpected request");
        const start = Date.parse(request.start_time);
        const end = Date.parse(request.end_time);
        const timestamps = [start];
        for (let t = Math.ceil(start / 1000) * 1000; t <= end; t += 1000)
          timestamps.push(t);
        return {
          [entity]: timestamps.map((timestamp) => ({
            entity_id: entity,
            state: String(timestamp),
            attributes: {},
            last_updated: new Date(timestamp).toISOString(),
            last_changed: new Date(timestamp).toISOString(),
          })),
        };
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
      const trace = card.contentEl.data[0];
      maxPoints = Math.max(maxPoints, trace.x.length);
      if (+new Date(trace.x[0]) !== window.cacheNow - 60000)
        throw new Error("Plotted range did not advance");
      if (trace.y.at(-1) !== String(window.cacheNow))
        throw new Error("Latest sample missing");
    }
    return { maxPoints, plottedPoints: card.contentEl.data[0].y.length };
  });
  assert.equal(retention.maxPoints, 61);
  assert.equal(retention.plottedPoints, 61);
  results.results.push(
    "rolling dynamic range keeps 61 samples across 20 card refreshes",
  );
  const modernCardResults = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const rendered = [];
    for (const { type, data } of window.modernTraceCases) {
      await card.setConfig({
        type: "custom:plotly-graph",
        raw_plotly_config: true,
        refresh_interval: 0,
        layout: {},
        entities: [{ entity: "", ...data, type }],
      });
      try {
        await card.plot({ should_fetch: true });
      } catch (error) {
        throw new Error(`${type}: ${error.message}`);
      }
      if (card.errorMsgEl.textContent)
        throw new Error(card.errorMsgEl.textContent);
      if (
        card.contentEl._fullData[0].type !== type ||
        card.contentEl._fullData[0].visible === false
      ) {
        throw new Error(`${type}: card did not render the requested trace`);
      }
      rendered.push(`Lovelace card: ${type}`);
    }
    return rendered;
  });
  results.results.push(...modernCardResults);
  await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    const end = Date.now() - 3600000;
    const start = end - 3600000;
    const ids = ["sensor.east", "sensor.west", "sensor.north", "sensor.south"];
    window.statisticsRequests = [];
    window.statisticsBounds = [start, end];
    card.hass = {
      ...card.hass,
      callWS: async (request) => {
        if (request.type !== "recorder/statistics_during_period")
          throw new Error("Unexpected request");
        window.statisticsRequests.push(request);
        return Object.fromEntries(
          request.statistic_ids.map((id, index) => [
            id,
            [
              { start, end: start + 300000, mean: index + 1, min: index, max: index + 3 },
              { start: start + 300000, end: start + 600000, mean: index + 2, min: index + 1, max: index + 4 },
            ].map((row) => Object.fromEntries(Object.entries(row).filter(([key]) =>
              !request.types || key === "start" || key === "end" || request.types.includes(key)
            ))),
          ]),
        );
      },
    };
    card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: "$fn () => window.statisticsBounds",
      layout: { xaxis: {
        tickvals: "$fn () => [window.statisticsBounds[0]]",
        ticktext: "$fn () => ['Start']",
      } },
      entities: ids.map((entity) => ({
        entity,
        statistic: "mean",
        period: "5minute",
      })),
    });
  });
  await page.waitForFunction(
    () =>
      document.getElementById("card-under-test").contentEl?._fullData
        ?.length === 4,
  );
  const statisticsState = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    await card.plot({ should_fetch: true });
    return {
      requests: window.statisticsRequests,
      error: card.errorMsgEl.textContent,
      values: card.contentEl.data.map((trace) => trace.y),
    };
  });
  assert.equal(statisticsState.error, "");
  assert.equal(statisticsState.requests.length, 1);
  assert.deepEqual(statisticsState.requests[0].statistic_ids, [
    "sensor.east",
    "sensor.west",
    "sensor.north",
    "sensor.south",
  ]);
  assert.equal(statisticsState.requests[0].period, "5minute");
  assert.deepEqual(statisticsState.requests[0].types, ["mean"]);
  assert.deepEqual(statisticsState.values, [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ]);
  results.results.push(
    "four statistics traces request only mean and render from one cached response",
  );
  await page.evaluate(() => {
    const card = document.getElementById("card-under-test");
    const end = Date.now() - 60000;
    const start = end - 3600000;
    const entityIds = [
      "sensor.one",
      "sensor.two",
      "sensor.three",
      "sensor.four",
    ];
    window.historyRequests = [];
    card.hass = {
      ...card.hass,
      states: Object.fromEntries(
        entityIds.map((entity_id) => [
          entity_id,
          {
            entity_id,
            state: "2",
            attributes: { unit_of_measurement: "W" },
            last_changed: new Date(end).toISOString(),
            last_updated: new Date(end).toISOString(),
          },
        ]),
      ),
      callApi: () => {
        throw new Error("History must not use REST");
      },
      callWS: async (request) => {
        if (request.type !== "history/history_during_period")
          throw new Error("Unexpected request");
        window.historyRequests.push(request);
        return Object.fromEntries(
          request.entity_ids.map((id, index) => [
            id,
            [
              { s: String(index + 1), lu: start / 1000 },
              { s: String(index + 2), lu: end / 1000 },
            ],
          ]),
        );
      },
    };
    card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: [start, end],
      entities: entityIds.map((entity) => ({
        entity,
        extend_to_present: false,
      })),
    });
  });
  await page.waitForFunction(() => {
    const card = document.getElementById("card-under-test");
    return card.contentEl?._fullData?.length === 4;
  });
  const historyState = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    await card.plot({ should_fetch: true });
    return {
      requests: window.historyRequests,
      values: card.contentEl.data.map((trace) => trace.y),
      error: card.errorMsgEl.textContent,
    };
  });
  assert.equal(historyState.error, "");
  assert.equal(historyState.requests.length, 1);
  assert.deepEqual(historyState.requests[0].entity_ids, [
    "sensor.one",
    "sensor.two",
    "sensor.three",
    "sensor.four",
  ]);
  assert.deepEqual(historyState.values, [
    ["1", "2"],
    ["2", "3"],
    ["3", "4"],
    ["4", "5"],
  ]);
  results.results.push(
    "four history traces render from one WebSocket request and reuse the cache",
  );
  const generatedFilters = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const end = Date.now() - 60000;
    card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: [end - 86400000, end],
      reused_filters: ["force_numeric", { add: 1 }],
      entities: [
        {
          entity: "sensor.one",
          extend_to_present: false,
          extra_filters: [{ multiply: 2 }],
          filters: "$ex [...get('reused_filters'), ...get('.extra_filters')]",
        },
        {
          entity: "sensor.two",
          extend_to_present: false,
          filters: '$fn () => [{ map_y: "0" }]',
        },
      ],
    });
    await card.plot({ should_fetch: true });
    return {
      values: card.contentEl.data.map((trace) => trace.y),
      rendered: card.contentEl.calcdata.map((points) =>
        points.map((point) => point.y),
      ),
      error: card.errorMsgEl.textContent,
    };
  });
  assert.equal(generatedFilters.error, "");
  assert.deepEqual(generatedFilters.values, [
    [4, 6],
    [0, 0],
  ]);
  assert.deepEqual(generatedFilters.rendered, [
    [4, 6],
    [0, 0],
  ]);
  results.results.push(
    "generated and reused filter lists render through the card",
  );
  const shiftedHistoryResults = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const now = Date.now();
    const originalNow = Date.now;
    const rendered = [];
    Date.now = () => now;
    try {
      const samples = Array.from({ length: 241 }, (_, i) => ({
        s: String(i % 20),
        lu: (now - 4 * 3600000 + i * 60000) / 1000,
      }));
      card.hass = {
        ...card.hass,
        states: {},
        callWS: async ({ entity_ids, start_time, end_time }) => {
          const start = Date.parse(start_time) / 1000;
          const end = Date.parse(end_time) / 1000;
          const preceding = samples.filter(({ lu }) => lu < start).slice(-1);
          const within = samples.filter(({ lu }) => lu >= start && lu < end);
          return Object.fromEntries(
            entity_ids.map((id) => [id, [...preceding, ...within]]),
          );
        },
      };
      for (const resample of [false, true]) {
        card.isBrowsing = false;
        card.configParser.resetObservedRange();
        await card.setConfig({
          type: "custom:plotly-graph",
          hours_to_show: 1,
          refresh_interval: 0,
          autorange_after_scroll: true,
          entities: [
            {
              entity: `sensor.shifted_${resample}`,
              time_offset: "-450s",
              ...(resample ? { filters: [{ resample: "5s" }] } : {}),
            },
          ],
        });
        await card.plot({ should_fetch: true });
        const end = now - 3600000;
        card.enterBrowsingMode();
        await card.withoutRelayout(() =>
          PlotlyTest.default.relayout(card.contentEl, {
            "xaxis.range": [end - 3600000, end],
          }),
        );
        await card.plot({ should_fetch: true });
        if (card.errorMsgEl.textContent)
          throw new Error(card.errorMsgEl.textContent);
        const xs = card.contentEl.data[0].x.map(Number);
        if (xs.some((x, i) => i && x < xs[i - 1])) {
          throw new Error("Shifted history runs backwards after panning");
        }
        const expectedEnd = resample ? Math.floor(end / 5000) * 5000 : end;
        // Resampling excludes the endpoint when it is exactly on the grid.
        const last =
          resample && end % 5000 === 0 ? expectedEnd - 5000 : expectedEnd;
        if (
          xs.at(-1) !== last ||
          !card.contentEl.querySelector(".scatterlayer .js-line")
        ) {
          throw new Error("Shifted history was clipped or not rendered");
        }
        rendered.push(
          `shifted history stays ordered after panning${resample ? " with resampling" : ""}`,
        );
      }
    } finally {
      Date.now = originalNow;
    }
    return rendered;
  });
  results.results.push(...shiftedHistoryResults);
  const gapState = await page.evaluate(async () => {
    const card = document.getElementById("card-under-test");
    const end = Date.now() - 60000;
    const start = end - 24 * 3600000;
    const gap = start + 12 * 3600000;
    const recovery = gap + 60000;
    const entity = "sensor.history_gap";
    card.hass = {
      ...card.hass,
      states: {
        [entity]: {
          entity_id: entity,
          state: "10",
          attributes: {},
          last_changed: new Date(recovery).toISOString(),
          last_updated: new Date(recovery).toISOString(),
        },
      },
      callWS: async (request) => {
        if (request.type !== "history/history_during_period")
          throw new Error("Unexpected request");
        return {
          [entity]: [
            { s: "10", lu: start / 1000 },
            { s: "unavailable", lu: gap / 1000 },
            { s: "10", lu: recovery / 1000 },
            { s: "10", lu: end / 1000 },
          ],
        };
      },
    };
    await card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: [start, end],
      layout: { yaxis: { range: [0, 30] } },
      entities: [{ entity, extend_to_present: false }],
    });
    await card.plot({ should_fetch: true });
    const original = card.parsed_config.entities[0];
    const originalData = JSON.stringify({ x: original.x, y: original.y });
    const paths = () =>
      [...card.contentEl.querySelectorAll(".scatterlayer .js-line")].map(
        (path) => {
          const length = path.getTotalLength();
          return {
            start: path.getPointAtLength(0).x,
            end: path.getPointAtLength(length).x,
          };
        },
      );
    const expected = [start, gap, recovery, end].map((time) =>
      card.contentEl._fullLayout.xaxis.d2p(time),
    );
    const corrected = paths();
    const drawnCount = card.contentEl.data[0].x.length;
    PlotlyTest.default.Fx.hover(card.contentEl, [
      { curveNumber: 0, pointNumber: 1 },
    ]);
    const heldStateHover = card.contentEl.querySelector(
      ".hoverlayer .hovertext .nums",
    )?.textContent;
    PlotlyTest.default.Fx.unhover(card.contentEl);
    await PlotlyTest.default.react(
      card.contentEl,
      card.parsed_config.entities,
      card.parsed_config.layout,
      card.parsed_config.config,
    );
    const uncorrected = paths();
    await card.plot({ should_fetch: false });
    await card.plot({ should_fetch: false });
    return {
      error: card.errorMsgEl.textContent,
      originalY: original.y,
      originalCount: original.x.length,
      unchanged:
        originalData === JSON.stringify({ x: original.x, y: original.y }),
      drawnCount,
      repeatedCount: card.contentEl.data[0].x.length,
      corrected,
      uncorrected,
      expected,
      heldStateHover,
      shape: card.contentEl._fullData[0].line.shape,
      connectgaps: card.contentEl._fullData[0].connectgaps,
    };
  });
  assert.equal(gapState.error, "");
  assert.equal(gapState.shape, "hv");
  assert.equal(gapState.connectgaps, false);
  assert.equal(gapState.corrected.length, 2);
  assert.equal(gapState.uncorrected[0].start, gapState.uncorrected[0].end);
  for (const [actual, expected] of [
    [gapState.corrected[0].start, gapState.expected[0]],
    [gapState.corrected[0].end, gapState.expected[1]],
    [gapState.corrected[1].start, gapState.expected[2]],
    [gapState.corrected[1].end, gapState.expected[3]],
  ])
    assert.ok(Math.abs(actual - expected) < 0.02, `${actual} != ${expected}`);
  assert.equal(gapState.unchanged, true);
  assert.deepEqual(gapState.originalY, ["10", null, "10", "10"]);
  assert.equal(gapState.drawnCount, gapState.originalCount + 1);
  assert.equal(gapState.repeatedCount, gapState.drawnCount);
  assert.ok(gapState.heldStateHover.includes("10"));
  results.results.push(
    "history step lines preserve the known state until unavailable, without closing the actual gap",
    "gap endpoints preserve hover templates without changing parsed measurements or accumulating on redraw",
  );
  await page.evaluate(async () => {
    document.getElementById("card-under-test").remove();
    const card = new CardTest.PlotlyGraph();
    card.id = "card-under-test";
    card.style.cssText = "display: block; width: 480px;";
    const end = Date.now() - 60000;
    const start = end - 24 * 3600000;
    const entity = "sensor.history_gap_clicks";
    const history = [
      [start, "10"],
      [start + 8 * 3600000, "unavailable"],
      [start + 9 * 3600000, "20"],
      [start + 16 * 3600000, "unknown"],
      [start + 17 * 3600000, "30"],
      [end, "40"],
    ];
    window.historyGapClicks = [];
    card.hass = {
      locale: { language: "en", first_weekday: "monday", time_zone: "server" },
      config: { time_zone: "UTC" },
      themes: { darkMode: false },
      states: {
        [entity]: {
          entity_id: entity,
          state: "40",
          attributes: {},
          last_changed: new Date(end).toISOString(),
          last_updated: new Date(end).toISOString(),
        },
      },
      callWS: async (request) => {
        if (request.type !== "history/history_during_period")
          throw new Error("Unexpected request");
        return {
          [entity]: history.map(([time, state]) => ({
            s: state,
            lu: time / 1000,
          })),
        };
      },
    };
    await card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      visible_range: [start, end],
      layout: {
        width: 480,
        height: 320,
        yaxis: { range: [0, 50] },
        hovermode: "closest",
      },
      config: { doubleClick: false },
      entities: [
        {
          entity,
          extend_to_present: false,
          customdata:
            "$fn ({ ys }) => ys.map((value, sourceIndex) => ({ sourceIndex, value: Number(value) }))",
          on_click: `$fn () => ({ points }) => {
            const point = points[0];
            window.historyGapClicks.push({
              pointIndex: point.pointIndex,
              pointNumber: point.pointNumber,
              y: Number(point.y),
              customdata: point.customdata,
              traceY: Number(point.data.y[point.pointIndex]),
            });
          }`,
        },
      ],
    });
    document.body.append(card);
    await card.plot({ should_fetch: true });
  });
  await page.locator("#card-under-test").scrollIntoViewIfNeeded();
  for (const [pointIndex, sourceIndex, y] of [
    [1, 0, 10], // The drawing-only endpoint before the first outage.
    [3, 2, 20], // One extra endpoint precedes this measurement.
    [6, 4, 30], // Two extra endpoints precede this measurement.
  ]) {
    const target = await page.evaluate((index) => {
      const card = document.getElementById("card-under-test");
      const div = card.contentEl;
      const rect = div.getBoundingClientRect();
      const layout = div._fullLayout;
      const point = div.calcdata[0][index];
      return {
        x: rect.left + layout.xaxis._offset + layout.xaxis.c2p(point.x),
        y: rect.top + layout.yaxis._offset + layout.yaxis.c2p(point.y),
        count: window.historyGapClicks.length,
      };
    }, pointIndex);
    await page.mouse.move(target.x, target.y);
    // Plotly throttles hover detection; click only once it finds this point.
    await page.waitForFunction(
      (index) =>
        document
          .getElementById("card-under-test")
          .contentEl._hoverdata?.some((point) => point.pointNumber === index),
      pointIndex,
    );
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(
      (count) => window.historyGapClicks.length > count,
      target.count,
    );
    assert.deepEqual(
      await page.evaluate(() => window.historyGapClicks.at(-1)),
      {
        pointIndex,
        pointNumber: pointIndex,
        y,
        customdata: { sourceIndex, value: y },
        traceY: y,
      },
    );
    // Separate clicks: even with autoscaling disabled, Plotly emits a
    // double-click relayout that would race the next pointer movement.
    await page.waitForTimeout(350);
  }
  assert.deepEqual(
    await page.evaluate(
      () =>
        document.getElementById("card-under-test").parsed_config.entities[0].y,
    ),
    ["10", null, "20", null, "30", "40"],
  );
  results.results.push(
    "clicks at gap endpoints and after multiple outages preserve Plotly indices and return aligned values and customdata",
  );
  await page.evaluate(() => {
    const start = Date.parse("2026-10-03T00:00:00Z");
    const hour = 3600000;
    const realNow = Date.now;
    const fixture = (window.statisticsFixture = {
      now: start + 12 * hour + 60000,
      start,
      hour,
      realNow,
      requests: [],
      handlers: new Map(),
      subscriptions: [],
      unsubscriptions: [],
      renders: 0,
      hourlyRows: [
        { start: start + 10 * hour, end: start + 11 * hour, mean: 1 },
      ],
      shortRows: [
        {
          start: start + 12 * hour + 55 * 60000,
          end: start + 13 * hour,
          mean: 1,
        },
      ],
      dailyValue: 3,
    });
    Date.now = () => fixture.now;
    const ids = [
      "sensor.hour_a",
      "sensor.hour_b",
      "sensor.day",
      "sensor.short",
    ];
    const states = Object.fromEntries(
      ids.map((entity_id) => [
        entity_id,
        {
          entity_id,
          state: "1",
          attributes: {},
          last_changed: new Date(start + 10 * hour).toISOString(),
          last_updated: new Date(start + 10 * hour).toISOString(),
        },
      ]),
    );
    fixture.states = states;
    const card = (fixture.card = new CardTest.PlotlyGraph());
    card.style.width = "480px";
    card.hass = {
      states,
      locale: { language: "en", first_weekday: "monday" },
      config: { time_zone: "Europe/Zurich" },
      themes: { darkMode: false },
      connection: {
        subscribeEvents: async (callback, event) => {
          fixture.subscriptions.push(event);
          fixture.handlers.set(event, callback);
          return () => {
            fixture.unsubscriptions.push(event);
            fixture.handlers.delete(event);
          };
        },
      },
      callWS: async (request) => {
        fixture.requests.push(request);
        const response = Object.fromEntries(
          request.statistic_ids.map((id, index) => {
            const rows =
              request.period === "day"
                ? [
                    { start, end: start + 24 * hour, mean: fixture.dailyValue },
                  ].filter(
                    (row) =>
                      row.start < Date.parse(request.end_time) &&
                      row.end > Date.parse(request.start_time),
                  )
                : (request.period === "hour"
                    ? fixture.hourlyRows
                    : fixture.shortRows
                  )
                    .filter(
                      (row) =>
                        row.start >= Date.parse(request.start_time) &&
                        row.start < Date.parse(request.end_time),
                    )
                    .map((row) => ({ ...row, mean: row.mean + index }));
            return [id, rows];
          }),
        );
        if (fixture.pauseNextRequest) {
          fixture.pauseNextRequest = false;
          await new Promise((resolve) => {
            fixture.finishRequest = resolve;
            fixture.requestStarted = true;
          });
          fixture.requestStarted = false;
        }
        return response;
      },
    };
    card.setConfig({
      type: "custom:plotly-graph",
      hours_to_show: 24,
      refresh_interval: "auto",
      entities: ids.slice(0, 2).map((entity) => ({
        entity,
        statistic: "mean",
        period: "hour",
        type: "bar",
      })),
    });
    document.body.append(card);
  });
  await page.waitForFunction(() => {
    const f = statisticsFixture;
    return (
      f.card.contentEl.data?.length === 2 &&
      f.handlers.has("recorder_hourly_statistics_generated")
    );
  });
  const beforeStateUpdates = await page.evaluate(() => {
    const f = statisticsFixture;
    f.card.contentEl.on("plotly_afterplot", () => f.renders++);
    const before = { requests: f.requests.length, renders: f.renders };
    for (let i = 0; i < 20; i++) {
      f.now += 1000;
      f.states = {
        ...f.states,
        "sensor.hour_a": {
          ...f.states["sensor.hour_a"],
          state: String(i + 2),
          last_updated: new Date(f.now).toISOString(),
        },
      };
      f.card.hass = { ...f.card.hass, states: f.states };
    }
    return before;
  });
  await page.waitForFunction(
    (renders) => statisticsFixture.renders > renders,
    beforeStateUpdates.renders,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.requests.length),
    beforeStateUpdates.requests,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.subscriptions.length),
    1,
  );
  results.results.push(
    "frequent statistics sensor state changes render without refetching statistics",
  );
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.hourlyRows.push({
      start: f.start + 11 * f.hour,
      end: f.start + 12 * f.hour,
      mean: 2,
    });
    f.now += 60000;
    f.handlers.get("recorder_hourly_statistics_generated")();
  });
  await page.waitForFunction(
    () => statisticsFixture.card.contentEl.data[0].y.length === 2,
  );
  const liveHourly = await page.evaluate(() => {
    const f = statisticsFixture;
    return {
      requests: f.requests,
      subscriptions: f.subscriptions,
      ys: f.card.contentEl.data.map((trace) => trace.y),
      bars: f.card.contentEl.querySelectorAll(".barlayer .point").length,
      statesUnchanged: f.card.hass.states === f.states,
      error: f.card.errorMsgEl.textContent,
    };
  });
  assert.equal(liveHourly.error, "");
  assert.equal(liveHourly.statesUnchanged, true);
  assert.deepEqual(liveHourly.ys, [
    [1, 2],
    [2, 3],
  ]);
  assert.equal(liveHourly.bars, 4);
  assert.equal(liveHourly.requests.length, 2);
  assert.equal(
    Date.parse(liveHourly.requests[1].start_time),
    Date.parse("2026-10-03T11:00:00Z") - 1,
  );
  assert.deepEqual(liveHourly.subscriptions, [
    "recorder_hourly_statistics_generated",
  ]);
  results.results.push(
    "late hourly bars appear on recorder events without a sensor state change or full-window fetch",
  );
  const beforePendingRefresh = await page.evaluate(() => {
    const f = statisticsFixture;
    f.now = f.start + 13 * f.hour + 60000;
    f.hourlyRows.push({
      start: f.start + 12 * f.hour,
      end: f.start + 13 * f.hour,
      mean: 3,
    });
    f.pauseNextRequest = true;
    f.handlers.get("recorder_hourly_statistics_generated")();
    return f.requests.length;
  });
  await page.waitForFunction(() => statisticsFixture.requestStarted);
  const subscriptionsDuringFetch = await page.evaluate(() => {
    const f = statisticsFixture;
    f.card.hass = { ...f.card.hass, states: { ...f.states } };
    return {
      subscriptions: f.subscriptions.length,
      unsubscriptions: f.unsubscriptions.length,
      active: f.handlers.has("recorder_hourly_statistics_generated"),
    };
  });
  assert.deepEqual(subscriptionsDuringFetch, {
    subscriptions: 1,
    unsubscriptions: 0,
    active: true,
  });
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.now = f.start + 14 * f.hour + 60000;
    f.hourlyRows.push({
      start: f.start + 13 * f.hour,
      end: f.start + 14 * f.hour,
      mean: 4,
    });
    f.handlers.get("recorder_hourly_statistics_generated")();
    f.finishRequest();
  });
  await page.waitForFunction(
    () => statisticsFixture.card.contentEl.data[0].y.length === 4,
  );
  const afterPendingRefresh = await page.evaluate(() => ({
    requests: statisticsFixture.requests.length,
    ys: statisticsFixture.card.contentEl.data.map((trace) => trace.y),
    subscriptions: statisticsFixture.subscriptions.length,
    unsubscriptions: statisticsFixture.unsubscriptions.length,
  }));
  assert.deepEqual(afterPendingRefresh, {
    requests: beforePendingRefresh + 2,
    ys: [
      [1, 2, 3, 4],
      [2, 3, 4, 5],
    ],
    subscriptions: 1,
    unsubscriptions: 0,
  });
  results.results.push(
    "HA updates during a pending fetch keep recorder subscriptions active",
    "recorder events during a pending fetch queue the next published statistics",
  );
  await page.evaluate(() => {
    statisticsFixture.card.setConfig({
      type: "custom:plotly-graph",
      hours_to_show: 24,
      refresh_interval: "auto",
      entities: [
        { entity: "sensor.day", statistic: "mean", period: "day", type: "bar" },
      ],
    });
  });
  await page.waitForFunction(
    () =>
      statisticsFixture.card.contentEl.data?.length === 1 &&
      statisticsFixture.card.contentEl.data[0].y[0] === 3,
  );
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.dailyValue = 9;
    f.now += f.hour;
    f.handlers.get("recorder_hourly_statistics_generated")();
  });
  await page.waitForFunction(
    () => statisticsFixture.card.contentEl.data[0].y[0] === 9,
  );
  assert.equal(
    await page.evaluate(
      () =>
        statisticsFixture.card.contentEl.querySelectorAll(".barlayer .point")
          .length,
    ),
    1,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.subscriptions.length),
    1,
  );
  results.results.push(
    "daily aggregate bars update in place at the same timestamp",
  );
  await page.evaluate(() => {
    const f = statisticsFixture;
    const end = Math.floor(f.now / 300000) * 300000;
    f.shortRows = [{ start: end - 300000, end, mean: 1 }];
    statisticsFixture.card.setConfig({
      type: "custom:plotly-graph",
      hours_to_show: 2,
      refresh_interval: "auto",
      entities: [
        {
          entity: "sensor.short",
          statistic: "mean",
          period: "5minute",
          type: "bar",
        },
        { entity: "sensor.day", statistic: "mean", period: "day", type: "bar" },
      ],
    });
  });
  await page.waitForFunction(
    () =>
      statisticsFixture.card.contentEl.data?.length === 2 &&
      statisticsFixture.handlers.size === 2,
  );
  const beforeShortEvent = await page.evaluate(() => {
    const f = statisticsFixture;
    const count = f.requests.length;
    const start = f.shortRows.at(-1).end;
    f.shortRows.push({ start, end: start + 300000, mean: 4 });
    f.now += 300000;
    f.handlers.get("recorder_5min_statistics_generated")();
    return count;
  });
  await page.waitForFunction(
    () => statisticsFixture.card.contentEl.data[0].y.length === 2,
  );
  assert.deepEqual(
    await page.evaluate(
      (before) => ({
        periods: statisticsFixture.requests
          .slice(before)
          .map((request) => request.period),
        daily: statisticsFixture.card.contentEl.data[1].y,
      }),
      beforeShortEvent,
    ),
    { periods: ["5minute"], daily: [9] },
  );
  results.results.push(
    "5minute recorder events do not refetch hourly calendar aggregates",
  );
  const beforeHourEvent = await page.evaluate(() => {
    const f = statisticsFixture;
    const count = f.requests.length;
    f.dailyValue = 10;
    f.now += f.hour;
    f.handlers.get("recorder_hourly_statistics_generated")();
    return count;
  });
  await page.waitForFunction(
    () => statisticsFixture.card.contentEl.data[1].y[0] === 10,
  );
  assert.deepEqual(
    await page.evaluate(
      (before) =>
        statisticsFixture.requests
          .slice(before)
          .map((request) => request.period),
      beforeHourEvent,
    ),
    ["day"],
  );
  results.results.push(
    "hourly recorder events do not refetch short-term statistics",
  );
  const beforeMixed = await page.evaluate(() => {
    const f = statisticsFixture;
    const count = f.requests.length;
    const start = Math.floor(f.now / 300000) * 300000;
    f.shortRows.push({
      start,
      end: start + 300000,
      mean: 6,
    });
    f.dailyValue = 11;
    f.now += 5 * 60000;
    f.handlers.get("recorder_5min_statistics_generated")();
    f.handlers.get("recorder_hourly_statistics_generated")();
    return count;
  });
  await page.waitForFunction(
    () =>
      statisticsFixture.card.contentEl.data[0].y.length === 3 &&
      statisticsFixture.card.contentEl.data[1].y[0] === 11,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.requests.length),
    beforeMixed + 2,
  );
  results.results.push(
    "simultaneous 5minute and hourly notifications are coalesced with separate request periods",
  );
  const navigationWithShortEvent = await page.evaluate(async () => {
    const f = statisticsFixture;
    await f.card.plot({ should_fetch: false });
    const before = f.requests.length;
    f.now += 1000;
    f.dailyValue = 99;
    const start = f.shortRows.at(-1).end;
    f.shortRows.push({ start, end: start + 300000, mean: 7 });
    f.handlers.get("recorder_5min_statistics_generated")();
    await PlotlyTest.default.relayout(f.card.contentEl, {
      "xaxis.range": [f.now - f.hour, f.now - 1000],
    });
    await f.card.plot({ should_fetch: true });
    return {
      periods: f.requests.slice(before).map((request) => request.period),
      daily: f.card.contentEl.data[1].y,
      short: f.card.contentEl.data[0].y.at(-1),
    };
  });
  assert.deepEqual(navigationWithShortEvent, {
    periods: ["5minute"],
    daily: [11],
    short: 7,
  });
  results.results.push(
    "navigation coalesced with a recorder event still refreshes only the published resolution",
  );
  await page.evaluate(() => {
    statisticsFixture.dailyValue = 11;
  });
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.oldCallbacks = [...f.handlers.values()];
    f.card.setConfig({ ...f.card.config, refresh_interval: 0 });
  });
  await page.waitForFunction(
    () =>
      statisticsFixture.card.parsed_config.refresh_interval === 0 &&
      statisticsFixture.handlers.size === 0,
  );
  const beforeDisabled = await page.evaluate(() => {
    statisticsFixture.oldCallbacks.forEach((callback) => callback());
    return statisticsFixture.requests.length;
  });
  await page.waitForTimeout(650);
  assert.equal(
    await page.evaluate(() => statisticsFixture.requests.length),
    beforeDisabled,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.unsubscriptions.length),
    2,
  );
  results.results.push(
    "disabling refresh removes recorder subscriptions and ignores stale event callbacks",
  );
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.card.setConfig({
      ...f.card.config,
      refresh_interval: 1,
      entities: [
        { entity: "sensor.day", statistic: "mean", period: "day", type: "bar" },
      ],
    });
  });
  await page.waitForFunction(
    () =>
      statisticsFixture.card.contentEl.data?.length === 1 &&
      statisticsFixture.card.parsed_config.refresh_interval === 1,
  );
  const beforePolling = await page.evaluate(() => {
    const f = statisticsFixture;
    f.dailyValue = 12;
    f.now += f.hour;
    return f.requests.length;
  });
  await page.waitForFunction(
    () => statisticsFixture.card.contentEl.data[0].y[0] === 12,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.requests.length),
    beforePolling + 1,
  );
  assert.equal(await page.evaluate(() => statisticsFixture.handlers.size), 0);
  results.results.push(
    "explicit refresh intervals still update partial statistics without recorder subscriptions",
  );
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.card.setConfig({ ...f.card.config, refresh_interval: "auto" });
  });
  await page.waitForFunction(
    () =>
      statisticsFixture.card.parsed_config.refresh_interval === "auto" &&
      statisticsFixture.handlers.has("recorder_hourly_statistics_generated"),
  );
  const beforeReconnect = await page.evaluate(() => {
    const f = statisticsFixture;
    f.card.remove();
    f.dailyValue = 13;
    f.now += f.hour;
    return f.requests.length;
  });
  assert.equal(await page.evaluate(() => statisticsFixture.handlers.size), 0);
  await page.evaluate(() => document.body.append(statisticsFixture.card));
  await page.waitForFunction(
    () =>
      statisticsFixture.card.contentEl.data[0].y[0] === 13 &&
      statisticsFixture.handlers.size === 1,
  );
  assert.equal(
    await page.evaluate(() => statisticsFixture.requests.length),
    beforeReconnect + 1,
  );
  results.results.push(
    "reconnected cards refetch statistics published while disconnected",
  );
  const cachedNavigation = await page.evaluate(async () => {
    const f = statisticsFixture;
    await f.card.plot({ should_fetch: false });
    const before = f.requests.length;
    f.now += 1000;
    f.dailyValue = 14;
    for (const minutesBack of [90, 100]) {
      await PlotlyTest.default.relayout(f.card.contentEl, {
        "xaxis.range": [f.now - minutesBack * 60000, f.now - 1000],
      });
      await f.card.plot({ should_fetch: true });
    }
    await PlotlyTest.default.restyle(f.card.contentEl, {
      visible: "legendonly",
    });
    await f.card.plot({ should_fetch: true });
    await PlotlyTest.default.restyle(f.card.contentEl, { visible: true });
    await f.card.plot({ should_fetch: true });
    return {
      requests: f.requests.length - before,
      values: f.card.contentEl.data[0].y,
    };
  });
  assert.deepEqual(cachedNavigation, { requests: 0, values: [13] });
  results.results.push(
    "cached zoom, pan and legend toggles do not refetch mutable statistics",
  );
  const missingNavigation = await page.evaluate(async () => {
    const f = statisticsFixture;
    const before = f.requests.length;
    await PlotlyTest.default.relayout(f.card.contentEl, {
      "xaxis.range": [f.start - 36 * f.hour, f.start - f.hour],
    });
    await f.card.plot({ should_fetch: true });
    const requests = f.requests.slice(before);
    await PlotlyTest.default.relayout(f.card.contentEl, {
      "xaxis.range": [f.now - 100 * 60000, f.now - 1000],
    });
    await f.card.plot({ should_fetch: true });
    return {
      requests,
      total: f.requests.length - before,
      values: f.card.contentEl.data[0].y,
    };
  });
  assert.equal(missingNavigation.total, 1);
  assert.equal(
    Date.parse(missingNavigation.requests[0].start_time),
    Date.parse("2026-10-03T00:00:00Z") - 36 * 3600000 - 1,
  );
  assert.ok(
    Date.parse(missingNavigation.requests[0].end_time) <
      Date.parse("2026-10-03T00:00:00Z"),
  );
  assert.deepEqual(missingNavigation.values, [13]);
  results.results.push(
    "panning into uncached history fetches only the missing range, not the cached recent aggregate",
  );
  const explicitRefresh = await page.evaluate(async () => {
    const f = statisticsFixture;
    const before = f.requests.length;
    f.now += 1000;
    await f.card.plot({ should_fetch: true, refresh_statistics: true });
    return {
      requests: f.requests.length - before,
      values: f.card.contentEl.data[0].y,
    };
  });
  assert.deepEqual(explicitRefresh, { requests: 1, values: [14] });
  results.results.push(
    "explicit refreshes replace mutable statistics even inside a fully cached viewport",
  );
  const resetRefresh = await page.evaluate(async () => {
    const f = statisticsFixture;
    const before = f.requests.length;
    f.now += 1000;
    f.dailyValue = 15;
    await f.card.exitBrowsingMode();
    await f.card.plot({ should_fetch: false });
    return {
      requests: f.requests.length - before,
      values: f.card.contentEl.data[0].y,
      browsing: f.card.isBrowsing,
    };
  });
  assert.deepEqual(resetRefresh, {
    requests: 1,
    values: [15],
    browsing: false,
  });
  results.results.push("resetting the view still refreshes recent statistics");
  const pausedRefresh = await page.evaluate(async () => {
    const f = statisticsFixture;
    const before = f.requests.length;
    f.now += 1000;
    f.dailyValue = 16;
    f.card.pausedRendering = true;
    f.handlers.get("recorder_hourly_statistics_generated")();
    await f.card.plot({ should_fetch: true });
    const whilePaused = f.requests.length - before;
    f.card.pausedRendering = false;
    await f.card.plot({ should_fetch: true });
    return {
      whilePaused,
      requests: f.requests.length - before,
      values: f.card.contentEl.data[0].y,
    };
  });
  assert.deepEqual(pausedRefresh, {
    whilePaused: 0,
    requests: 1,
    values: [16],
  });
  results.results.push(
    "a recorder update queued during a touch gesture survives the navigation-only render",
  );
  await page.evaluate(() => {
    const f = statisticsFixture;
    f.card.remove();
    PlotlyTest.default.purge(f.card.contentEl);
    Date.now = f.realNow;
  });
  assert.deepEqual(errors, []);
  console.log(
    `Plotly ${results.version}: ${results.results.length} browser checks passed`,
  );
  console.log(results.results.join(", "));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
