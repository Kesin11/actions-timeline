import { setTimeout } from "node:timers/promises";
import { debug, getInput, info, summary } from "npm:@actions/core@1.10.0";
import * as github from "npm:@actions/github@5.1.1";
import { createGantt } from "./workflow_gantt.ts";
import {
  createOctokit,
  fetchWorkflow,
  fetchWorkflowRunJobs,
} from "./github.ts";

const main = async () => {
  const token = getInput("github-token", { required: true });
  const octokit = createOctokit(token);

  info("Wait for workflow API result stability...");
  await setTimeout(1000);

  info("Fetch workflow...");
  const workflow = await fetchWorkflow(
    octokit,
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
  );
  debug(JSON.stringify(workflow, null, 2));
  info("Fetch workflow_job...");
  const workflowJobs = await fetchWorkflowRunJobs(
    octokit,
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
  );
  debug(JSON.stringify(workflowJobs, null, 2));

  info("Create gantt mermaid diagram...");
  const gantt = createGantt(workflow, workflowJobs);
  await summary.addRaw(gantt).write();
  debug(gantt);

  info("Complete!");
};
main();
