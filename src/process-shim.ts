// Some dependencies (the stream polyfill of the image trace) expect Node's
// `process`. esbuild injects it only into the files that use it.
export { default as process } from "process/browser";
