import { build, emptyDir } from "https://deno.land/x/dnt@0.38.1/mod.ts";
// @deno-types="https://deno.land/x/esbuild@v0.19.2/mod.d.ts"
import * as esbuild from "https://deno.land/x/esbuild@v0.19.2/mod.js"

console.debug("Start dnt ...")

const outDir = "./npm";
await emptyDir(outDir);
await build({
  entryPoints: ["./main.ts"],
  outDir,
  typeCheck: false,
  declaration: false,
  esModule: false,
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  package: {
    // package.json properties
    name: "@kesin11/actions-timeline",
    version: Deno.args[0],
    description: "Show workflow timeline in summary",
    license: "MIT",
    repository: {
      type: "git",
      url: "https://github.com/Kesin11/actions-timeline.git",
    },
    bugs: {
      url: "https://github.com/Kesin11/actions-timeline/issues",
    },
  },
});

console.log("Start esbuild ...")
const distDir = "./dist";
await emptyDir(distDir);

await esbuild.build({
  entryPoints: ["./npm/src/main.ts"],
  outdir: distDir,
  bundle: true,
  platform: "node",
  target: "node16",
  format: "cjs",
  minify: true,
  sourcemap: true,
}).finally(() => {
  esbuild.stop()
})
