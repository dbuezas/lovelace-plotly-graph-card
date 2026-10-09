import assert from "node:assert/strict";
import { bundleInMemory } from "../build.mjs";
import { chromium } from "playwright";

const [bundle] = await bundleInMemory({
  code: `export { default as Plotly } from './src/plotly';
      export { PlotlyGraph } from './src/plotly-graph-card';`,
  name: "ResizeTest",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install(); // time runs normally until fastForward
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({
    content: bundle.code,
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

  // Off-screen cards update every 30 s, and catch up once visible
  const offScreen = (step) =>
    page.evaluate(async (step) => {
      const { Plotly, PlotlyGraph } = ResizeTest;
      const frames = async (n) => {
        for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
      };
      // Slow machines need more frames: wait for the change, up to ~2 s
      const until = async (condition) => {
        for (let i = 0; i < 120 && !condition(); i++) await frames(1);
      };
      const ysChange = async () => {
        const before = ys();
        await until(() => ys() !== before);
        return ys();
      };
      const ys = () => window.card.contentEl.data[0].y.join();
      const config = (y) => ({
        type: "custom:plotly-graph",
        refresh_interval: 0,
        entities: [{ entity: "", x: [1, 2], y }],
      });
      if (step === "mount") {
        const card = (window.card = new PlotlyGraph());
        card.style.cssText = "display:block;width:480px";
        card.hass = { states: {}, locale: { language: "en" } };
        await card.setConfig(config([1, 2]));
        document.body.append(card);
        while (!card.contentEl.data) await frames(1);
        window.spacer = document.createElement("div");
        window.spacer.style.height = "3000px";
        card.before(window.spacer); // below the fold
        await until(() => !card.onScreen);
        return card.onScreen;
      }
      if (step === "update") {
        await window.card.setConfig(config([window.nextY++]));
        await frames(10);
        return ys();
      }
      if (step === "rendered") return ysChange();
      if (step === "scroll") {
        window.spacer.remove();
        const result = await ysChange();
        window.card.remove();
        Plotly.purge(window.card.contentEl);
        return result;
      }
    }, step);
  await page.evaluate(() => (window.nextY = 3));
  assert.equal(await offScreen("mount"), false);
  // Rendered right before going off-screen: the update waits
  assert.equal(await offScreen("update"), "1,2");
  await page.clock.fastForward(30_000);
  assert.equal(await offScreen("rendered"), "3");
  results.push("off-screen cards update every 30 s");
  assert.equal(await offScreen("update"), "3");
  assert.equal(await offScreen("scroll"), "4");
  results.push("off-screen cards catch up once visible");

  console.log(
    `${results.length} resize browser checks passed:\n${results.join("\n")}`,
  );
  assert.deepEqual(errors, []);
  console.log(`${results.length} resize browser checks passed:\n${results.join("\n")}`);
} finally {
  await browser.close();
}
