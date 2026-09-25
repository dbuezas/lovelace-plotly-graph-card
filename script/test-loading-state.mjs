import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Use the real card and Plotly, injecting delays only at the data/render boundary.
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
  globalName: "LoadingTest",
  outdir: "dist",
  minify: true,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`<!doctype html><style>
    body { --ha-card-background: rgb(240, 241, 242); --primary-color: blue; }
  </style><body></body>`);
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
  });
  const results = await page.evaluate(async () => {
    const { Plotly, PlotlyGraph } = LoadingTest;
    const results = [];
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const frame = () => new Promise(requestAnimationFrame);
    const realReact = Plotly.react;
    customElements.define("ha-card", class extends HTMLElement {});
    const makeCard = async (height) => {
      const card = new PlotlyGraph();
      // Exercise the actual render path explicitly, without observer races.
      card.plot = async () => {};
      card.style.width = "480px";
      card.hass = { states: {}, locale: { language: "en" } };
      await card.setConfig({
        type: "custom:plotly-graph",
        entities: [],
        ...(height === undefined ? {} : { layout: { height } }),
      });
      document.body.append(card);
      await frame();
      const parsed = {
        entities: [{ type: "scatter", x: [1, 2], y: [10, 20] }],
        layout: { width: 480, height: height || 285 },
        config: { showSendToCloud: false },
        refresh_interval: 0,
        autorange_after_scroll: false,
      };
      card.configParser.update = async () => ({ errors: [], parsed });
      return { card, parsed };
    };
    const checkLoading = (card, height) => {
      const cardHeight = height + card.titleEl.getBoundingClientRect().height;
      check(card.cardEl.classList.contains("loading"), "Loading class missing");
      check(card.cardEl.getAttribute("aria-busy") === "true", "Not busy");
      check(
        getComputedStyle(card.loadingEl).display === "flex",
        "Loader hidden",
      );
      check(
        Math.abs(card.cardEl.getBoundingClientRect().height - cardHeight) < 1,
        `Expected ${cardHeight}px, got ${card.cardEl.getBoundingClientRect().height}px`,
      );
      check(card.getBoundingClientRect().height >= height, "Host collapsed");
    };
    const checkFinished = (card) => {
      check(
        !card.cardEl.classList.contains("loading"),
        "Loading class remained",
      );
      check(card.cardEl.getAttribute("aria-busy") === "false", "Still busy");
      check(
        card.loadingEl.getAttribute("aria-hidden") === "true",
        "Loader accessible",
      );
      check(
        getComputedStyle(card.loadingEl).display === "none",
        "Loader visible",
      );
      check(card.isInternalRelayout === 0, "Relayout guard remained set");
    };
    const destroy = (card) => {
      card.remove();
      Plotly.purge(card.contentEl);
    };
    const { card, parsed } = await makeCard();
    checkLoading(card, 285);
    const initialHeight = card.getBoundingClientRect().height;
    check(
      getComputedStyle(card.cardEl).backgroundColor === "rgb(240, 241, 242)",
      "HA background not used",
    );
    results.push(
      "default height, visible host, themed background and busy state",
    );
    const animation = getComputedStyle(card.loadingEl, "::after");
    check(animation.animationDuration === "2.2s", "Unexpected animation speed");
    check(parseFloat(animation.width) < 0.1 * 480, "Indicator too wide");
    results.push("subtle scan-line animation");

    let releaseFetch;
    card.configParser.update = () =>
      new Promise((resolve) => {
        releaseFetch = () => resolve({ errors: [], parsed });
      });
    const rendering = card._plot();
    while (!releaseFetch) await frame();
    await frame();
    checkLoading(card, 285);
    results.push("loading space remains reserved during pending data request");
    let releaseRender;
    Plotly.react = (...args) =>
      new Promise((resolve, reject) => {
        releaseRender = () => realReact(...args).then(resolve, reject);
      });
    releaseFetch();
    while (!releaseRender) await frame();
    checkLoading(card, 285);
    results.push("indicator remains until Plotly finishes rendering");
    releaseRender();
    await rendering;
    Plotly.react = realReact;
    checkFinished(card);
    check(card.contentEl.style.visibility === "", "Rendered graph hidden");
    check(
      Math.abs(card.getBoundingClientRect().height - initialHeight) < 1,
      "Layout shifted",
    );
    results.push(
      "successful first render removes indicator without layout shift",
    );
    card.configParser.update = async () => ({ errors: [], parsed });
    await card._plot();
    checkFinished(card);
    results.push("subsequent refresh does not restart initial loading");
    destroy(card);

    const custom = await makeCard(420);
    checkLoading(custom.card, 420);
    const customHeight = custom.card.getBoundingClientRect().height;
    await custom.card._plot();
    checkFinished(custom.card);
    check(
      Math.abs(custom.card.getBoundingClientRect().height - customHeight) < 1,
      "Configured height changed after rendering",
    );
    results.push("configured height is reserved and preserved after rendering");
    destroy(custom.card);

    for (const stage of ["parse", "render"]) {
      const { card, parsed } = await makeCard();
      const failure = new Error(`Injected ${stage} failure`);
      if (stage === "parse")
        card.configParser.update = async () => {
          throw failure;
        };
      else
        Plotly.react = async () => {
          throw failure;
        };
      let caught;
      try {
        await card._plot();
      } catch (error) {
        caught = error;
      }
      check(caught === failure, "Original error was swallowed");
      checkFinished(card);
      Plotly.react = realReact;
      card.configParser.update = async () => ({ errors: [], parsed });
      await card._plot();
      checkFinished(card);
      check(
        card.contentEl.style.visibility === "",
        "Recovery left graph hidden",
      );
      results.push(
        `${stage} failure clears loading state and permits recovery`,
      );
      destroy(card);
    }
    const reduced = await makeCard();
    window.loadingCard = reduced.card;
    return results;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(window.loadingCard.loadingEl, "::after").animationName,
    ),
    "none",
  );
  results.push("reduced-motion preference disables animation");
  assert.deepEqual(errors, []);
  console.log(`${results.length} loading-state browser checks passed`);
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
