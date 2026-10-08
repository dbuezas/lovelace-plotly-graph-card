// Run in the browser console on an authenticated Home Assistant page.
// Only reads statistics. Replace these IDs with measurement sensors.
(async () => {
  const ids = ["sensor.a", "sensor.b", "sensor.c", "sensor.d"];
  const runs = 8;
  const hass = document.querySelector("home-assistant").hass;
  const end = Math.floor(Date.now() / 300000) * 300000;
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
  };
  const project = (data) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(data).map(([id, rows]) => [
          id,
          rows.map(({ start, end, mean }) => ({ start, end, mean })),
        ]),
      ),
    );
  const results = [];
  for (const [label, period, hours] of [
    ["24h", "5minute", 24],
    ["7d", "hour", 168],
    ["90d", "day", 2160],
  ]) {
    const request = {
      type: "recorder/statistics_during_period",
      statistic_ids: ids,
      period,
      start_time: new Date(end - hours * 3600000).toISOString(),
      end_time: new Date(end).toISOString(),
    };
    const fetch = async (types) => {
      const start = performance.now();
      const data = await hass.callWS({
        ...request,
        ...(types ? { types } : {}),
      });
      const ms = performance.now() - start;
      const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
      return { ms, bytes, data };
    };
    await fetch();
    await fetch(["mean"]);
    const all = [],
      selected = [];
    for (let i = 0; i < runs; i++) {
      let a, b;
      if (i % 2) {
        a = await fetch();
        b = await fetch(["mean"]);
      } else {
        b = await fetch(["mean"]);
        a = await fetch();
      }
      if (project(a.data) !== project(b.data)) {
        throw new Error(`Different values or timestamps for ${label}`);
      }
      all.push(a);
      selected.push(b);
    }
    const points = Object.values(all[0].data).reduce(
      (n, rows) => n + rows.length,
      0,
    );
    if (points === 0) throw new Error(`No statistics available for ${label}`);
    results.push({
      label,
      period,
      points,
      start: request.start_time,
      end: request.end_time,
      all_bytes: all[0].bytes,
      mean_bytes: selected[0].bytes,
      all_ms: median(all.map(({ ms }) => ms)),
      mean_ms: median(selected.map(({ ms }) => ms)),
      all_runs: all.map(({ ms }) => ms),
      mean_runs: selected.map(({ ms }) => ms),
      same_values: true,
    });
  }
  console.table(results.map(({ all_runs, mean_runs, ...row }) => row));
  console.log(
    JSON.stringify({ at: new Date().toISOString(), runs, ids, results }),
  );
})().catch(console.error);
