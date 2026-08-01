import { setTimeout } from "node:timers/promises";
import process from "node:process";
import {
  debug,
  getBooleanInput,
  getInput,
  info,
  summary,
  warning,
} from "@actions/core";
import * as github from "@actions/github";
import { createMermaid } from "./workflow_gantt.ts";
import { expandCompositeSteps } from "./composite.ts";
import { Github } from "./github.ts";
import { expandParallelSteps } from "./parallel.ts";

const PARALLEL_FALLBACK_SUMMARY =
  "Parallel steps could not be expanded for one or more jobs. Those jobs use the standard timeline layout.\n\n";

const main = async () => {
  const token = getInput("github-token", { required: true });
  const showWaitingRunner = getBooleanInput("show-waiting-runner");
  const expandCompositeActions = getBooleanInput("expand-composite-actions");
  const expandCompositeActionsThreshold = Number(
    getInput("expand-composite-actions-threshold"),
  );
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

  info("Expanding parallel steps...");
  const parallelResult = await expandParallelSteps(
    client,
    workflowRun,
    workflowJobs,
  );
  parallelResult.warnings.forEach((item) =>
    warning(
      `Parallel steps were not expanded for job "${item.jobName}" (${item.jobId}): ${item.reason}`,
    )
  );

  let jobs = parallelResult.jobs;
  if (expandCompositeActions) {
    info("Expanding composite action steps...");
    jobs = await expandCompositeSteps(
      client,
      workflowRun,
      parallelResult.jobs,
      {
        thresholdSec: expandCompositeActionsThreshold,
      },
    );
  }

  info("Create gantt mermaid diagram...");
  const gantt = createMermaid(workflowRun, jobs, { showWaitingRunner });
  if (parallelResult.warnings.length > 0) {
    summary.addRaw(PARALLEL_FALLBACK_SUMMARY);
  }
  await summary.addRaw(gantt).write();
  debug(gantt);

  info("Complete!");
};
main();
