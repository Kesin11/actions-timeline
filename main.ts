import { summary } from "npm:@actions/core@1.10.0"
import * as github from "npm:@actions/github@5.1.1"

// DEBUG
if (Deno.env.get("GITHUB_STEP_SUMMARY") === undefined) {
  Deno.env.set("GITHUB_STEP_SUMMARY", "out.md")
  Deno.openSync("out.md", { create: true, write: true })
  Deno.truncateSync("out.md")
}

const main = async () => {
  await summary.addRaw(`github.run_id: ${github.context.runId}\n`).write()

  const gantt = `
\`\`\`mermaid
gantt
    title ジョブのガントPOC
    dateFormat  HH:mm:ss
    axisFormat  %H:%M:%S
    section Job1
      actions/checkout@v3 :done, Job1-1, 00:00:00, 30s
      actions/setup-node@v2 :active, Job1-2, after Job1-1, 20s
      npm run build :crit, done, Job1-3, after Job1-2, 10s
    section Job2
      actions/checkout@v3 :Job2-1, 00:00:00, 10s
      actions/upload-artifact :Job2-2, after Job2-1, 20s
      actions/cache :Job2-3, after Job2-2, 5s
    section Job3
    actions/checkout@v3 :Job3-1, 00:01:10, 10s
    actions/download-artifact :Job3-2, after Job3-1, 20s
    build :crit, Job3-3, after Job3-2, 10s
\`\`\`
  `
  await summary.addRaw(gantt).write()
}
main()
