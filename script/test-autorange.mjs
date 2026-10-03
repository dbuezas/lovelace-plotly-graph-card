import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    contents: `export { default as Plotly } from './src/plotly';
      export { PlotlyGraph } from './src/plotly-graph-card';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "AutorangeTest",
  outdir: "dist",
  minify: true,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
  });
  const results = await page.evaluate(async () => {
    const { Plotly, PlotlyGraph } = AutorangeTest;
    customElements.define("ha-card", class extends HTMLElement {});
    const card = new PlotlyGraph();
    // Drive the real render path without background resize/refresh races.
    card.plot = async () => {};
    card.style.cssText = "display:block;width:480px";
    const now = Date.now();
    const hour = 3600000;
    const source = {
      xs: [-4, -2, -1, -0.5, 1].map((offset) => new Date(now + offset * hour)),
      ys: [1000, 10, 20, 30, 2000],
    };
    card.hass = {
      locale: { language: "en", first_weekday: "monday" },
      states: { "sensor.generated": { attributes: { data: source } } },
    };
    const config = {
      type: "custom:plotly-graph",
      refresh_interval: 0,
      hours_to_show: "3h",
      autorange_after_scroll: true,
      entities: [{
        entity: "",
        type: "bar",
        filters: [{ fn: '({ hass }) => hass.states["sensor.generated"].attributes.data' }],
      }],
    };
    await card.setConfig(config);
    document.body.append(card);
    await card._plot({ should_fetch: false });
    const snapshot = () => ({
      ys: [...card.contentEl.data[0].y],
      maximum: card.contentEl._fullLayout.yaxis.range[1],
      error: card.errorMsgEl.textContent,
    });
    const initial = snapshot();
    await Plotly.relayout(card.contentEl, {
      "xaxis.range": [
        new Date(now - hour - 1).toISOString(),
        new Date(now - hour / 3).toISOString(),
      ],
    });
    await card._plot({ should_fetch: false });
    const browsed = snapshot();
    await card.setConfig({ ...config, autorange_after_scroll: false });
    await card._plot({ should_fetch: false });
    const disabled = snapshot();
    await card.setConfig({
      ...config,
      raw_plotly_config: true,
      layout: { xaxis: { type: "date" } },
      entities: [{ ...config.entities[0], x: "$ex xs", y: "$ex ys" }],
    });
    await card._plot({ should_fetch: false });
    const raw = snapshot();
    card.remove();
    Plotly.purge(card.contentEl);
    return {
      initial, browsed, disabled, raw,
      sourceXs: source.xs.map(Number),
      sourceYs: source.ys,
      expectedXs: [-4, -2, -1, -0.5, 1].map((offset) => now + offset * hour),
    };
  });
  assert.equal(results.initial.error, "");
  assert.deepEqual(results.initial.ys, [10, 20, 30]);
  assert.ok(results.initial.maximum < 100);
  assert.equal(results.browsed.error, "");
  assert.deepEqual(results.browsed.ys, [20, 30]);
  assert.ok(results.browsed.maximum < 100);
  assert.equal(results.disabled.error, "");
  assert.deepEqual(results.disabled.ys, [1000, 10, 20, 30, 2000]);
  assert.equal(results.raw.error, "");
  assert.deepEqual(results.raw.ys, [1000, 10, 20, 30, 2000]);
  assert.deepEqual(results.sourceYs, [1000, 10, 20, 30, 2000]);
  assert.deepEqual(results.sourceXs, results.expectedXs);
  assert.deepEqual(errors, []);
  console.log("PASS: filtered bar autorange, panning, disabled/raw mode, source preservation");
} finally {
  await browser.close();
}
