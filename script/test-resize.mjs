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
  globalName: "ResizeTest",
  outdir: "dist",
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
    const { Plotly, PlotlyGraph } = ResizeTest;
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const wait = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error("Resize timed out");
        await new Promise(requestAnimationFrame);
      }
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    let notifications = 0;
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback) {
        super((...args) => { notifications++; callback(...args); });
      }
    };
    customElements.define("ha-card", class extends HTMLElement {
      connectedCallback() { this.style.display = "block"; }
    });
    const card = new PlotlyGraph();
    card.style.cssText = "display:block;width:480px";
    card.hass = { states: {}, locale: { language: "en", first_weekday: "monday" } };
    const counts = { parse: 0, react: 0 };
    const update = card.configParser.update.bind(card.configParser);
    card.configParser.update = (...args) => { counts.parse++; return update(...args); };
    const react = Plotly.react;
    Plotly.react = (...args) => { counts.react++; return react(...args); };
    await card.setConfig({
      type: "custom:plotly-graph",
      refresh_interval: 0,
      entities: [{ entity: "", x: [1, 2], y: [1, 2] }],
    });
    document.body.append(card);
    await wait(() => card.contentEl._fullLayout?.width === 480);
    await settle();
    const results = [];
    try {
      let before = { ...counts };
      let observed = notifications;
      card.handles.resizeObserver.unobserve(card.cardEl);
      card.handles.resizeObserver.observe(card.cardEl);
      await wait(() => notifications > observed);
      await settle();
      check(counts.parse === before.parse && counts.react === before.react,
        "Unchanged size triggered parsing or rendering");
      results.push("unchanged-size callbacks do not render");

      observed = notifications;
      card.style.display = "none";
      await wait(() => notifications > observed);
      await settle();
      check(counts.parse === before.parse && counts.react === before.react,
        "Hidden card triggered parsing or rendering");
      card.style.width = "540px";
      card.style.display = "block";
      await wait(() => card.contentEl._fullLayout.width === 540);
      await settle();
      results.push("hidden card is skipped and resizes when shown");

      before = { ...counts };
      card.style.width = "620px";
      await wait(() => card.contentEl._fullLayout.width === 620);
      await settle();
      check(counts.parse > before.parse && counts.react > before.react,
        "Width change skipped the normal parse/render path");
      check(!card.errorMsgEl.textContent.trim(), card.errorMsgEl.textContent);
      results.push("normal width changes parse and render");
      return results;
    } finally {
      card.remove();
      Plotly.purge(card.contentEl);
      Plotly.react = react;
      window.ResizeObserver = NativeObserver;
    }
  });
  assert.deepEqual(errors, []);
  console.log(`${results.length} resize browser checks passed:\n${results.join("\n")}`);
} finally {
  await browser.close();
}
