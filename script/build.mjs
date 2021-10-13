// @ts-check
import esbuild from "esbuild";
import alias from 'esbuild-plugin-alias';
import { createRequire } from 'module';

const isProd = process.env.NODE_ENV === "production";

// @ts-ignore
const _require = createRequire(import.meta.url);

const buildOptions = {
  entryPoints: ["src/index.tsx"],
  bundle: true,
  inject: ["script/preact-shim.js"],
  minify: isProd,
  metafile: true,
  sourcemap: isProd ? false : "inline",
  outfile: "dist/plotly-graph-card.js",
  define: {
    NODE_ENV: process.env.NODE_ENV,
    "process.env.NODE_ENV": `"${process.env.NODE_ENV}"`,
  },
  plugins: [
    alias({
      "react": _require.resolve("preact/compat"),
      "react-dom/test-utils": _require.resolve("preact/test-utils"),
      "react-dom": _require.resolve("preact/compat"),
      "react/jsx-runtime": _require.resolve("preact/jsx-runtime"),
    }),
  ],
}
async function serve() {
  const result = await esbuild.serve({
    servedir: "dist",
    onRequest: (args) => console.log(args)
  }, buildOptions);
  console.log("serving on", result)
}
async function build() {
  const result = await esbuild.build(buildOptions);
  let text =
    result.metafile && (await esbuild.analyzeMetafile(result.metafile));
  console.log(text);

}
if (isProd)
  build();
else
  serve();
