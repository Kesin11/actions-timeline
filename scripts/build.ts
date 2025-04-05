import { build, emptyDir } from "jsr:@deno/dnt@0.41.3";
import * as esbuild from "npm:esbuild@0.25.2";

console.debug("Start dnt ...");

const outDir = "./npm";
await emptyDir(outDir);
await build({
  entryPoints: ["./src/main.ts", "./src/post.ts"],
  outDir,
  typeCheck: false,
  test: false,
  declaration: false,
  esModule: false,
  shims: {
    deno: true,
  },
  importMap: "deno.jsonc",
  package: {
    // Dummy package.json
    name: "@kesin11/actions-timeline",
    version: "0.1.0",
    description:
      "An Action shows timeline of a GitHub Action workflow in the run summary page.",
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

console.log("Start esbuild ...");
const distDir = "./dist";
await emptyDir(distDir);

await esbuild.build({
  entryPoints: ["./npm/src/main.ts", "./npm/src/post.ts"],
  outdir: distDir,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  minify: false,
  sourcemap: false,
}).finally(() => {
});

console.log("Complete!");
