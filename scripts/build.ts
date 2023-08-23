import { build, emptyDir } from "https://deno.land/x/dnt@0.38.1/mod.ts";

const outDir = "./npm";
await emptyDir(outDir);

await build({
  entryPoints: ["./main.ts"],
  outDir,
  typeCheck: false,
  declaration: false,
  scriptModule: false,
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
