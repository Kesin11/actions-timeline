import { rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const distDir = "./dist";

await rm(distDir, { force: true, recursive: true });

await build({
  entryPoints: ["./src/main.ts", "./src/post.ts"],
  outdir: distDir,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  minify: false,
  sourcemap: false,
});

await writeFile(
  `${distDir}/package.json`,
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
  "utf8",
);
