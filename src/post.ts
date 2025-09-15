import { setTimeout } from "node:timers/promises";
import process from "node:process";
import { debug, getBooleanInput, getInput, info, summary } from "@actions/core";
import * as github from "@actions/github";
import { createMermaid } from "./workflow_gantt.ts";
import { Github } from "@kesin11/gha-utils";

const main = async () => {
  const token = getInput("github-token", { required: true });
  const showWaitingRunner = getBooleanInput("show-waiting-runner");
  const client = new Github({ token });

  info("Wait for workflow API result stability...");
  await setTimeout(1000);

  info("Fetch workflow...");
  // Currently, @actions/core does not provide runAttempt.
  // ref: https://github.com/actions/toolkit/pull/1387
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT
    ? Number(process.env.GITHUB_RUN_ATTEMPT)
    : 1;
  const workflowRun = await client.fetchWorkflowRun(
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
    runAttempt,
  );
  debug(JSON.stringify(workflowRun, null, 2));
  info("Fetch workflow_job...");
  const workflowJobs = await client.fetchWorkflowRunJobs(workflowRun);

  debug(JSON.stringify(workflowJobs, null, 2));

  info("Create gantt mermaid diagram...");
  const gantt = createMermaid(workflowRun, workflowJobs, { showWaitingRunner });
  await summary.addRaw(gantt).write();
  debug(gantt);

  info("Complete!");
};
main();
