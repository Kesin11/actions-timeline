import process from "node:process";
import { setTimeout } from "node:timers/promises";
import {
  debug as actionDebug,
  getBooleanInput as actionGetBooleanInput,
  getInput as actionGetInput,
  info as actionInfo,
  summary as actionSummary,
  warning as actionWarning,
} from "@actions/core";
import * as github from "@actions/github";
import { expandCompositeSteps } from "./composite.ts";
import { Github, type WorkflowJobs, type WorkflowRun } from "./github.ts";
import {
  expandParallelSteps,
  type ParallelExpansionResult,
} from "./parallel.ts";
import { createMermaid } from "./workflow_gantt.ts";

const PARALLEL_FALLBACK_SUMMARY =
  "Parallel steps could not be expanded for one or more jobs. Those jobs use the standard timeline layout.\n\n";

type SummaryWriter = {
  addRaw(markdown: string): SummaryWriter;
  write(): Promise<unknown>;
};

export type ActionPostDependencies = {
  createClient?: (options: { token: string }) => Github;
  debug?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
  getBooleanInput?: typeof actionGetBooleanInput;
  getInput?: typeof actionGetInput;
  info?: (message: string) => void;
  repository?: { owner: string; repo: string; runId: number };
  summary?: SummaryWriter;
  wait?: (milliseconds: number) => Promise<void>;
  warning?: (message: string) => void;
};

export async function runActionPost(
  dependencies: ActionPostDependencies = {},
): Promise<void> {
  const getInput = dependencies.getInput ?? actionGetInput;
  const getBooleanInput = dependencies.getBooleanInput ?? actionGetBooleanInput;
  const env = dependencies.env ?? process.env;
  const info = dependencies.info ?? actionInfo;
  const debug = dependencies.debug ?? actionDebug;
  const warning = dependencies.warning ?? actionWarning;
  const wait = dependencies.wait ?? setTimeout;
  const summary = dependencies.summary ?? actionSummary;
  const repository = dependencies.repository ?? {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    runId: github.context.runId,
  };

  const token = getInput("github-token", { required: true });
  const showWaitingRunner = getBooleanInput("show-waiting-runner");
  const expandCompositeActions = getBooleanInput("expand-composite-actions");
  const expandCompositeActionsThreshold = Number(
    getInput("expand-composite-actions-threshold"),
  );
  const client = (
    dependencies.createClient ?? ((options) => new Github(options))
  )({ token });

  info("Wait for workflow API result stability...");
  await wait(1000);

  info("Fetch workflow...");
  const runAttempt = env.GITHUB_RUN_ATTEMPT
    ? Number(env.GITHUB_RUN_ATTEMPT)
    : 1;
  const workflowRun = await client.fetchWorkflowRun(
    repository.owner,
    repository.repo,
    repository.runId,
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
  parallelResult.warnings.forEach((item) => {
    warning(
      `Parallel steps were not expanded for job "${item.jobName}" (${item.jobId}): ${item.reason}`,
    );
  });

  const jobs = await expandJobs(
    client,
    workflowRun,
    parallelResult,
    expandCompositeActions,
    expandCompositeActionsThreshold,
    info,
  );

  info("Create gantt mermaid diagram...");
  const gantt = createMermaid(workflowRun, jobs, { showWaitingRunner });
  if (parallelResult.warnings.length > 0) {
    summary.addRaw(PARALLEL_FALLBACK_SUMMARY);
  }
  await summary.addRaw(gantt).write();
  debug(gantt);

  info("Complete!");
}

async function expandJobs(
  client: Github,
  workflowRun: WorkflowRun,
  parallelResult: ParallelExpansionResult,
  expandCompositeActions: boolean,
  thresholdSec: number,
  info: (message: string) => void,
): Promise<WorkflowJobs> {
  if (!expandCompositeActions) return parallelResult.jobs;

  info("Expanding composite action steps...");
  return await expandCompositeSteps(client, workflowRun, parallelResult.jobs, {
    thresholdSec,
  });
}
