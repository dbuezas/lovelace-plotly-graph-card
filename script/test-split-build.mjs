// The production build splits Plotly into files that load on demand. This
// serves that build like HACS does and checks what each page downloads.
// Usage: npm run test:split (CHROME=/path/to/chrome to use another Chrome)
import { createServer } from "node:http";
import { basename } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const { outputFiles } = await build({
  entryPoints: ["src/plotly-graph-card.ts"],
  bundle: true,
  minify: true,
  splitting: true,
  format: "esm",
  chunkNames: "[name]-[hash]",
  outdir: "dist",
  write: false,
});
const files = new Map(
  outputFiles
    .filter((f) => f.path.endsWith(".js"))
    .map((f) => [basename(f.path), f.text])
);
const BASE = "/hacsfiles/lovelace-plotly-graph-card/";
const blocked = new Set();
const requests = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const name = url.pathname.slice(BASE.length);
  if (url.pathname.startsWith(BASE) && files.has(name)) {
    requests.push(name);
    if (blocked.has(name)) return res.writeHead(404).end();
    res.setHeader("Content-Type", "text/javascript");
    return res.end(files.get(name));
  }
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><body><script>
    customElements.define("ha-card", class extends HTMLElement {
      connectedCallback() { this.style.display = "block"; }
    });
  </script><script type="module" src="${BASE}plotly-graph-card.js?hacstag=1"></script></body>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
});
const results = [];
const check = (ok, msg, extra = "") =>
  results.push(
    `${ok ? "PASS" : "FAIL"}  ${msg}${extra === "" ? "" : `  (${extra})`}`
  );
const fileOf = (name) =>
  [...files.keys()].find((n) =>
    new RegExp(`^${name}-[A-Z0-9]{8}\\.js$`).test(n)
  );
const take = () => requests.splice(0);

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => customElements.get("plotly-graph"));
  await page.waitForTimeout(300);

  // cards: [{ id, language, traces: [{ type, ...data }] }]
  const mount = (cards) =>
    page.evaluate(async (cards) => {
      const now = Date.now();
      const x = Array.from({ length: 5 }, (_, i) => now - (4 - i) * 3600000);
      for (const { id, language = "en", traces } of cards) {
        const card = document.createElement("plotly-graph");
        card.id = id;
        card.style.cssText = "display:block;width:400px";
        card.hass = {
          states: {},
          locale: { language, first_weekday: "monday" },
          config: { time_zone: "UTC" },
          themes: { darkMode: false },
        };
        card.setConfig({
          type: "custom:plotly-graph",
          refresh_interval: 0,
          hours_to_show: "6h",
          entities: traces.map((t) => ({
            entity: "",
            x,
            y: [1, 3, 2, 4, 3],
            ...t,
          })),
        });
        document.body.append(card);
      }
      const ready = (card) =>
        card.contentEl?._fullData?.length ||
        card.shadowRoot.querySelector("#error-msg").innerText.trim();
      for (let i = 0; i < 200; i++) {
        const all = cards.map((c) => document.getElementById(c.id));
        if (all.every(ready)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return cards.map(({ id }) => {
        const card = document.getElementById(id);
        return {
          types: (card.contentEl._fullData || []).map((t) => t.type),
          error: card.shadowRoot.querySelector("#error-msg").innerText.trim(),
        };
      });
    }, cards);
  const removeAll = () =>
    page.evaluate(() =>
      document.querySelectorAll("plotly-graph").forEach((c) => c.remove())
    );

  const startup = take();
  check(
    startup.includes("plotly-graph-card.js") &&
      !startup.includes(fileOf("plotly")),
    "a page without graphs doesn't download Plotly",
    `${startup.length} files`
  );

  let out = await mount([
    { id: "mixed", traces: [{}, { type: "bar" }, { type: "box" }] },
    {
      id: "pie",
      traces: [{ type: "pie", labels: ["a", "b"], values: [1, 2] }],
    },
  ]);
  let got = take();
  check(
    out[0].types.join() === "scatter,bar,box" && !out[0].error,
    "a chart that mixes line, bar and box renders",
    out[0].types.join()
  );
  check(out[1].types.join() === "pie" && !out[1].error, "a pie chart renders");
  check(
    got.filter((n) => n === fileOf("charts2d")).length === 1,
    "two cards that need the same group download it once"
  );
  check(
    new Set(got).size === got.length,
    "no file is downloaded twice",
    `${got.length} files`
  );

  await removeAll();
  out = await mount([
    { id: "pie2", traces: [{ type: "pie", labels: ["a"], values: [1] }] },
    { id: "bar2", traces: [{ type: "bar" }, {}] },
  ]);
  got = take();
  check(
    out.every((c) => !c.error && c.types.length) && got.length === 0,
    "switching dashboard view downloads nothing again",
    got.join(" ")
  );

  out = await mount([{ id: "de", language: "de", traces: [{}] }]);
  got = take();
  check(
    got.join() === fileOf("de") && !out[0].error,
    "a German user downloads only the German locale",
    got.join(" ")
  );

  blocked.add(fileOf("geo"));
  out = await mount([
    { id: "geo", traces: [{ type: "scattergeo", lat: [47], lon: [8] }] },
  ]);
  check(
    out[0].error.includes("didn't load"),
    "a missing file shows a clear error",
    out[0].error.slice(0, 60)
  );
  blocked.clear();
  await page.reload();
  await page.waitForFunction(() => customElements.get("plotly-graph"));
  out = await mount([
    { id: "geo", traces: [{ type: "scattergeo", lat: [47], lon: [8] }] },
  ]);
  check(
    out[0].types.join() === "scattergeo" && !out[0].error,
    "after the file is back, a reload fixes it"
  );

  check(errors.length === 0, "no page errors", errors.join("; "));
} finally {
  await browser.close();
  server.close();
  console.log(results.join("\n"));
}
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
