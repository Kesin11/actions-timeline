import { getInput, info, summary } from "npm:@actions/core@1.10.0";
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

  info("Fetch workflow...");
  const workflow = await fetchWorkflow(
    octokit,
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
  );
  info("Fetch workflow_job...");
  const workflowJobs = await fetchWorkflowRunJobs(
    octokit,
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
  );

  info("Create gantt mermaid diagram...");
  const gantt = createGantt(workflow, workflowJobs);
  await summary.addRaw(gantt).write();
};
main();
