// ex. scripts/build_npm.ts
import { build, emptyDir } from "https://deno.land/x/dnt/mod.ts";

await emptyDir("./npm");

await build({
  entryPoints: ["./main.ts"],
  outDir: "./npm",
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
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
