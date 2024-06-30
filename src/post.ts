import { setTimeout } from "node:timers/promises";
import process from "node:process";
import { debug, getInput, info, summary } from "npm:@actions/core@1.10.1";
import * as github from "npm:@actions/github@6.0.0";
import { createMermaid } from "./workflow_gantt.ts";
import {
  createOctokitForAction,
  fetchWorkflow,
  fetchWorkflowRunJobs,
} from "./github.ts";

const main = async () => {
  const token = getInput("github-token", { required: true });
  const octokit = createOctokitForAction(token);

  info("Wait for workflow API result stability...");
  await setTimeout(1000);

  info("Fetch workflow...");
  // Currently, @actions/core does not provide runAttempt.
  // ref: https://github.com/actions/toolkit/pull/1387
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT
    ? Number(process.env.GITHUB_RUN_ATTEMPT)
    : 1;
  const workflow = await fetchWorkflow(
    octokit,
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
    runAttempt,
  );
  debug(JSON.stringify(workflow, null, 2));
  info("Fetch workflow_job...");
  const workflowJobs = await fetchWorkflowRunJobs(
    octokit,
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
    runAttempt,
  );
  debug(JSON.stringify(workflowJobs, null, 2));

  info("Create gantt mermaid diagram...");
  const gantt = createMermaid(workflow, workflowJobs, {});
  await summary.addRaw(gantt).write();
  debug(gantt);

  info("Complete!");
};
main();
