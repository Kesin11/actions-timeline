import { info, summary } from "npm:@actions/core@1.10.0";
import * as github from "npm:@actions/github@5.1.1";
import { createGantt } from "./workflow_gantt.ts";
import { fetchWorkflow, fetchWorkflowRunJobs } from "./github.ts";

// DEBUG
if (Deno.env.get("GITHUB_STEP_SUMMARY") === undefined) {
  Deno.env.set("GITHUB_STEP_SUMMARY", "out.md");
  Deno.openSync("out.md", { create: true, write: true });
  Deno.truncateSync("out.md");
}

const main = async () => {
  info("Fetch workflow...");
  const workflow = await fetchWorkflow(
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
  );
  info("Fetch workflow_job...");
  const workflowJobs = await fetchWorkflowRunJobs(
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
  );

  info("Create gantt mermaid diagram...");
  const gantt = createGantt(workflow, workflowJobs);
  await summary.addRaw(gantt).write();
};
main();
