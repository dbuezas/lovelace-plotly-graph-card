// Touch gestures with real (CDP) touch events in Chrome.
// Usage: npm run test:touch
// Uses Playwright's Chromium, or another Chrome with CHROME=/path/to/chrome
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const { outputFiles } = await build({
  entryPoints: ["src/plotly-graph-card.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "CardTest",
  outdir: "dist",
});
const js = outputFiles.find((f) => f.path.endsWith(".js")).text;
const server = createServer((req, res) => {
  const isJs = req.url.endsWith(".js");
  res.setHeader("Content-Type", isJs ? "text/javascript" : "text/html");
  res.end(
    isJs ? js : `<!doctype html><body><script src="/card.js"></script></body>`
  );
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
const info = (msg) => results.push(`INFO  ${msg}`);

try {
  const context = await browser.newContext({
    viewport: { width: 600, height: 500 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const cdp = await context.newCDPSession(page);
  const wait = (ms) => page.waitForTimeout(ms);
  // pts: [[x, y, id = index], ...] = all fingers currently down
  const touch = (type, pts = []) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: pts.map(([x, y, id], i) => ({ x, y, id: id ?? i })),
    });
  const tap = async (x, y) => {
    await touch("touchStart", [[x, y]]);
    await touch("touchEnd");
  };
  const moves = async (path, ms = 16) => {
    for (const pts of path) {
      await touch("touchMove", pts);
      await wait(ms);
    }
  };
  // path: list of finger lists, the first one starts the touch
  const drag = async (path, ms = 16) => {
    await touch("touchStart", path[0]);
    await moves(path.slice(1), ms);
  };
  const steps = (from, to, n = 8) =>
    Array.from({ length: n + 1 }, (_, i) =>
      from.map(([x, y], j) => [
        x + ((to[j][0] - x) * i) / n,
        y + ((to[j][1] - y) * i) / n,
      ])
    );

  const mount = (config) =>
    page.evaluate(async (config) => {
      if (!customElements.get("ha-card"))
        customElements.define(
          "ha-card",
          class extends HTMLElement {
            connectedCallback() {
              this.style.display = "block";
            }
          }
        );
      document.getElementById("c")?.remove();
      const card = new CardTest.PlotlyGraph();
      card.id = "c";
      card.style.cssText = "display:block;width:500px";
      card.hass = {
        states: {},
        locale: { language: "en", first_weekday: "monday" },
        config: { time_zone: "Europe/Zurich" },
        themes: { darkMode: false },
      };
      const now = Date.now();
      const x = Array.from({ length: 25 }, (_, i) => now - (24 - i) * 3600000);
      card.setConfig({
        type: "custom:plotly-graph",
        refresh_interval: 0,
        hours_to_show: "24h",
        entities: [
          { entity: "", x, y: x.map((_, i) => (i * 37) % 100), name: "P" },
          { entity: "", x, y: x.map((_, i) => (i * 53) % 100), name: "Q" },
        ],
        ...config,
      });
      document.body.append(card);
      await new Promise((r) => {
        const t = setInterval(() => {
          const el = card.contentEl;
          if (el?._fullData?.length === 2 && el.style.visibility === "") {
            clearInterval(t);
            r();
          }
        }, 50);
      });
      await new Promise((r) => setTimeout(r, 300));
      window.events = { click: 0, doubleclick: 0, legenddoubleclick: 0 };
      for (const name of Object.keys(window.events))
        card.contentEl.on(`plotly_${name}`, () => window.events[name]++);
    }, config);

  const state = () =>
    page.evaluate(() => {
      const card = document.getElementById("c");
      const el = card.contentEl;
      const r = el.querySelector(".nsewdrag").getBoundingClientRect();
      const legend = el.querySelector(".legendtoggle")?.getBoundingClientRect();
      return {
        rect: { l: r.left, t: r.top, w: r.width, h: r.height },
        legend: legend && [legend.left + 10, legend.top + legend.height / 2],
        range: el._fullLayout.xaxis.range.map(String).join(" .. "),
        span:
          el._fullLayout.xaxis.r2l(el._fullLayout.xaxis.range[1]) -
          el._fullLayout.xaxis.r2l(el._fullLayout.xaxis.range[0]),
        hover: [...el.querySelectorAll(".hoverlayer .hovertext")]
          .map((n) => n.textContent)
          .join(" | "),
        paused: card.pausedRendering,
        events: { ...window.events },
      };
    });
  // x value (ms) under a client x position
  const xAt = (clientX) =>
    page.evaluate((clientX) => {
      const el = document.getElementById("c").contentEl;
      const r = el.querySelector(".nsewdrag").getBoundingClientRect();
      return el._fullLayout.xaxis.p2l(clientX - r.left);
    }, clientX);

  await mount({});
  const s = await state();
  const { l, t, w, h } = s.rect;
  const cx = l + w / 2;
  const cy = t + h / 2;
  const tol = (span) => span * 0.01;
  const hour = 3600000;

  // --- Plotly keeps taps, double taps and one-finger pan
  for (const extended_touch_support of [false, true]) {
    const tag = `extended_touch_support ${extended_touch_support}:`;
    const config = { extended_touch_support };
    await mount(config);
    let s0 = await state();
    await tap(cx, cy);
    await wait(100);
    let s1 = await state();
    check(
      s1.events.click === 1,
      `${tag} tap emits plotly_click`,
      s1.events.click
    );
    check(
      (s1.hover === "") === extended_touch_support,
      `${tag} tap ${
        extended_touch_support ? "doesn't show" : "shows"
      } the tooltip`,
      s1.hover
    );
    await wait(400);

    await mount(config);
    await tap(cx, cy);
    await wait(80);
    await tap(cx, cy);
    await wait(300);
    s1 = await state();
    check(
      s1.events.doubleclick === 1,
      `${tag} double tap reaches Plotly (reset)`,
      `doubleclick=${s1.events.doubleclick}`
    );

    await mount(config);
    s0 = await state();
    await tap(...s0.legend);
    await wait(80);
    await tap(...s0.legend);
    await wait(300);
    s1 = await state();
    check(
      s1.events.legenddoubleclick === 1,
      `${tag} legend double tap reaches Plotly`,
      `legenddoubleclick=${s1.events.legenddoubleclick}`
    );

    await mount(config);
    s0 = await state();
    const x0 = await xAt(cx);
    await drag(steps([[cx, cy]], [[cx - 100, cy]]));
    await touch("touchEnd");
    await wait(300);
    check(
      Math.abs((await xAt(cx - 100)) - x0) < tol(s0.span),
      `${tag} one-finger drag pans with the finger`
    );
  }

  // --- Pinch: zoom at the fingers and pan with them, like a map
  await mount({});
  let s0 = await state();
  let a = await xAt(cx - 50);
  let b = await xAt(cx + 50);
  await drag(
    steps(
      [
        [cx - 50, cy],
        [cx + 50, cy],
      ],
      [
        [cx - 120, cy],
        [cx + 80, cy],
      ]
    )
  );
  let mid = await state();
  check(mid.paused, "pinch pauses rendering while zooming");
  await touch("touchEnd");
  await wait(300);
  let s1 = await state();
  check(
    s1.span < s0.span * 0.6,
    "pinch apart zooms in",
    `${(s0.span / hour).toFixed(1)}h -> ${(s1.span / hour).toFixed(1)}h`
  );
  check(
    Math.abs((await xAt(cx - 120)) - a) < tol(s1.span) &&
      Math.abs((await xAt(cx + 80)) - b) < tol(s1.span),
    "the data under each finger stays under it"
  );
  check(
    !s1.paused && s1.events.click === 0 && s1.events.doubleclick === 0,
    "after pinch: rendering resumes, no stray click",
    JSON.stringify(s1.events)
  );

  await mount({});
  s0 = await state();
  a = await xAt(cx);
  await drag(
    steps(
      [
        [cx - 40, cy],
        [cx + 40, cy],
      ],
      [
        [cx + 60, cy],
        [cx + 140, cy],
      ]
    )
  );
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    Math.abs((await xAt(cx + 100)) - a) < tol(s1.span) &&
      Math.abs(s1.span - s0.span) < tol(s0.span),
    "two fingers moving together pan without zooming"
  );

  await mount({});
  a = await xAt(cx - 50);
  await touch("touchStart", [
    [cx - 50, cy],
    [cx + 50, cy],
  ]);
  await touch("touchEnd", [[cx + 50, cy, 1]]); // CDP releases the listed fingers
  await moves(steps([[cx - 50, cy]], [[cx + 50, cy]]).slice(1));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    Math.abs((await xAt(cx + 50)) - a) < tol(s1.span),
    "after lifting one finger, the other keeps panning"
  );

  await mount({});
  s0 = await state();
  a = await xAt(cx - 40);
  await drag(steps([[cx - 40, cy]], [[cx - 10, cy]], 4)); // Plotly pans first
  await touch("touchMove", [
    [cx - 10, cy],
    [cx + 60, cy],
  ]); // second finger
  await moves(
    steps(
      [
        [cx - 10, cy],
        [cx + 60, cy],
      ],
      [
        [cx - 60, cy],
        [cx + 110, cy],
      ]
    ).slice(1)
  );
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    Math.abs((await xAt(cx - 60)) - a) < tol(s1.span),
    "pan, then second finger: the started pan is kept (no jump)",
    `${(((await xAt(cx - 60)) - a) / 60000).toFixed(1)} min off`
  );

  await mount({});
  await drag(
    steps(
      [
        [cx - 50, cy],
        [cx + 50, cy],
      ],
      [
        [cx - 100, cy],
        [cx + 100, cy],
      ],
      4
    )
  );
  await touch("touchCancel");
  await wait(300);
  s1 = await state();
  check(!s1.paused, "touchcancel ends the pinch (rendering resumes)");
  s0 = s1;
  await drag(steps([[cx, cy]], [[cx - 100, cy]]));
  await touch("touchEnd");
  await wait(300);
  check((await state()).range !== s0.range, "pan works after touchcancel");

  // --- Double tap, then drag
  await mount({});
  s0 = await state();
  await tap(cx, cy);
  await wait(80);
  await drag(steps([[cx, cy]], [[cx, cy + 80]]));
  mid = await state();
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    s1.span < s0.span * 0.8 && mid.paused,
    "double tap + drag down zooms in",
    `${(s0.span / hour).toFixed(1)}h -> ${(s1.span / hour).toFixed(1)}h`
  );
  check(
    s1.events.doubleclick === 0 && !s1.paused,
    "no Plotly double click (reset) after double-tap-drag"
  );

  await mount({});
  s0 = await state();
  a = await xAt(cx);
  await tap(cx, cy);
  await wait(80);
  await drag(steps([[cx, cy]], [[cx - 100, cy]]));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    Math.abs((await xAt(cx - 100)) - a) < tol(s1.span) &&
      Math.abs(s1.span - s0.span) < tol(s0.span),
    "double tap + drag sideways pans with the finger, without zooming"
  );

  await mount({});
  s0 = await state();
  a = await xAt(cx);
  await tap(cx, cy);
  await wait(80);
  await drag(steps([[cx, cy]], [[cx - 60, cy + 80]]));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    Math.abs((await xAt(cx - 60)) - a) < tol(s1.span) &&
      s1.span < s0.span * 0.8,
    "double tap + diagonal drag zooms and keeps the data under the finger"
  );

  await mount({});
  s0 = await state();
  await tap(cx, cy);
  await wait(80);
  await drag(steps([[cx, cy]], [[cx + 3, cy + 3]], 3));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    s1.events.doubleclick === 1,
    "double tap with a 4 px wobble is still a double tap",
    `doubleclick=${s1.events.doubleclick}`
  );

  // --- Scan (press and hold)
  await mount({});
  s0 = await state();
  await touch("touchStart", [[l + w * 0.3, cy]]);
  await wait(450);
  const sHold = await state();
  await touch("touchMove", [[l + w * 0.5, cy]]);
  await wait(80);
  const sMid = await state();
  await touch("touchMove", [[l + w * 0.8, cy]]);
  await wait(80);
  const sEnd = await state();
  check(sHold.hover !== "", "hold 300 ms shows the tooltip", sHold.hover);
  check(
    sMid.hover !== sHold.hover && sEnd.hover !== sMid.hover,
    "sliding moves the tooltip",
    `${sMid.hover} -> ${sEnd.hover}`
  );
  check(sEnd.range === s0.range, "the graph does not pan while scanning");
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(s1.hover === sEnd.hover, "the tooltip stays after lifting the finger");
  check(
    s1.events.click === 0,
    "no stray plotly_click after a scan",
    s1.events.click
  );
  await tap(l + w * 0.2, cy);
  await wait(300);
  const sTap = await state();
  check(
    sTap.hover === "" && sTap.events.click === 1,
    "a tap afterwards clears the tooltip and still clicks",
    sTap.hover
  );
  await drag(steps([[cx, cy]], [[cx - 100, cy]]));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    s1.hover === "" && s1.range !== s0.range,
    "a pan afterwards clears the tooltip and pans"
  );

  await mount({});
  s0 = await state();
  await touch("touchStart", [[cx, cy]]);
  await wait(450);
  await touch("touchMove", [
    [cx - 40, cy],
    [cx + 40, cy],
  ]);
  await moves(
    steps(
      [
        [cx - 40, cy],
        [cx + 40, cy],
      ],
      [
        [cx - 100, cy],
        [cx + 100, cy],
      ]
    ).slice(1)
  );
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    s1.span < s0.span * 0.6 && s1.hover === "",
    "scan, then a second finger: pinch zooms and the tooltip goes away"
  );

  await mount({});
  s0 = await state();
  await tap(cx, cy);
  await wait(80);
  await touch("touchStart", [[cx, cy]]);
  await wait(450);
  await moves(steps([[cx, cy]], [[cx + 60, cy + 60]]).slice(1));
  s1 = await state();
  await touch("touchEnd");
  await wait(300);
  check(
    s1.hover !== "" && (await state()).span === s0.span,
    "double tap + hold scans (no zoom)"
  );

  await mount({ layout: { hovermode: false } });
  s0 = await state();
  await touch("touchStart", [[cx, cy]]);
  await wait(450);
  await moves(steps([[cx, cy]], [[cx - 100, cy]]).slice(1));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    s1.hover === "" && s1.range !== s0.range,
    "hovermode: false turns scan off (hold + slide pans)"
  );

  await mount({ extended_touch_support: { hold_to_scan: false } });
  s0 = await state();
  await touch("touchStart", [[cx, cy]]);
  await wait(450);
  await moves(steps([[cx, cy]], [[cx - 100, cy]]).slice(1));
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    s1.hover === "" && s1.range !== s0.range,
    "hold_to_scan: false: hold + slide pans"
  );

  await mount({ disable_pinch_to_zoom: true });
  s0 = await state();
  await drag(
    steps(
      [
        [cx - 50, cy],
        [cx + 50, cy],
      ],
      [
        [cx - 120, cy],
        [cx + 120, cy],
      ]
    )
  );
  await touch("touchEnd");
  await wait(300);
  check(
    Math.abs((await state()).span - s0.span) < tol(s0.span),
    "disable_pinch_to_zoom turns pinch off"
  );

  // --- Each gesture can be turned off alone
  const pinchOut = async () => {
    const s0 = await state();
    await drag(
      steps(
        [
          [cx - 50, cy],
          [cx + 50, cy],
        ],
        [
          [cx - 120, cy],
          [cx + 120, cy],
        ]
      )
    );
    await touch("touchEnd");
    await wait(300);
    return (await state()).span < s0.span * 0.8;
  };
  const doubleTapDragIn = async () => {
    const s0 = await state();
    await tap(cx, cy);
    await wait(80);
    await drag(steps([[cx, cy]], [[cx, cy + 80]]));
    await touch("touchEnd");
    await wait(300);
    return (await state()).span < s0.span * 0.8;
  };
  await mount({ extended_touch_support: { pinch_to_zoom: false } });
  let p = await pinchOut();
  await mount({ extended_touch_support: { pinch_to_zoom: false } });
  check(
    !p && (await doubleTapDragIn()),
    "pinch_to_zoom: false: no pinch, double-tap-drag still zooms"
  );
  await mount({ extended_touch_support: { double_tap_drag_to_zoom: false } });
  p = await pinchOut();
  await mount({ extended_touch_support: { double_tap_drag_to_zoom: false } });
  check(
    p && !(await doubleTapDragIn()),
    "double_tap_drag_to_zoom: false: no double-tap-drag, pinch still zooms"
  );
  await mount({ extended_touch_support: { hold_to_scan: false } });
  await tap(cx, cy);
  await wait(100);
  check(
    (await state()).hover !== "",
    "hold_to_scan: false: a tap shows the tooltip again"
  );

  // --- Two quick swipes are pans, not a double-tap-drag
  await mount({});
  s0 = await state();
  await drag(steps([[cx + 60, cy]], [[cx - 60, cy]], 4), 10);
  await touch("touchEnd");
  await drag(steps([[cx, cy - 60]], [[cx, cy + 60]], 4), 10);
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  check(
    Math.abs(s1.span - s0.span) < tol(s0.span) && s1.range !== s0.range,
    "two quick swipes pan without zooming",
    `${(s0.span / hour).toFixed(1)}h -> ${(s1.span / hour).toFixed(1)}h`
  );

  // --- Lifecycle
  await mount({});
  await page.evaluate(() => {
    window.old = document.getElementById("c");
    window.oldHovers = 0;
    window.old.contentEl.on("plotly_hover", () => window.oldHovers++);
  });
  await touch("touchStart", [[cx, cy]]);
  await wait(60);
  await page.evaluate(() => window.old.remove());
  await wait(500);
  await touch("touchEnd");
  check(
    await page.evaluate(
      () =>
        window.oldHovers === 0 &&
        !window.old.contentEl.querySelector(".hoverlayer .hovertext")
    ),
    "card removed while holding: no tooltip afterwards"
  );

  await mount({});
  await drag(
    steps(
      [
        [cx - 50, cy],
        [cx + 50, cy],
      ],
      [
        [cx - 100, cy],
        [cx + 100, cy],
      ],
      4
    )
  );
  await page.evaluate(() => {
    window.old = document.getElementById("c");
    window.old.remove();
  });
  await touch("touchEnd");
  check(
    await page.evaluate(() => !window.old.pausedRendering),
    "card removed in the middle of a pinch: rendering is not left paused"
  );
  await mount({});
  s0 = await state();
  await drag(
    steps(
      [
        [cx - 50, cy],
        [cx + 50, cy],
      ],
      [
        [cx - 100, cy],
        [cx + 100, cy],
      ]
    )
  );
  await touch("touchEnd");
  await wait(300);
  s1 = await state();
  const ratio = s0.span / s1.span;
  check(
    Math.abs(ratio - 2) < 0.1,
    "pinch 100 px -> 200 px zooms exactly 2x (fingers keep their data)",
    ratio.toFixed(2)
  );

  check(errors.length === 0, "no page errors", errors.join("; "));

  // --- Speed, with the CPU slowed down 4x like a phone
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const [name, path] of [
    ["one-finger pan (Plotly)", steps([[cx - 100, cy]], [[cx + 100, cy]], 40)],
    [
      "pinch (card)",
      steps(
        [
          [cx - 30, cy],
          [cx + 30, cy],
        ],
        [
          [cx - 130, cy],
          [cx + 130, cy],
        ],
        40
      ),
    ],
  ]) {
    await mount({});
    const t0 = Date.now();
    await drag(path, 0);
    const ms = (Date.now() - t0) / 40;
    await touch("touchEnd");
    await wait(300);
    info(`${name}: ${ms.toFixed(1)} ms per touchmove`);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
} finally {
  await browser.close();
  server.close();
}
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
