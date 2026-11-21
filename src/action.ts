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
import {
  type ArtifactUploader,
  buildArtifactUrl,
  resolveCurrentJobId,
  resolveHtmlArtifactName,
  uploadHtmlArtifact,
} from "./github/artifact.ts";
import {
  Github,
  type WorkflowJobs,
  type WorkflowRun,
} from "./github/github.ts";
import { expandCompositeSteps } from "./logic/composite.ts";
import {
  expandParallelSteps,
  type ParallelExpansionResult,
} from "./logic/parallel.ts";
import { WorkflowModel } from "./models/workflow_file.ts";
import { createHtmlReport } from "./output/html/report.ts";
import { createMermaid } from "./output/mermaid/workflow_gantt.ts";

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
  uploadHtmlArtifact?: ArtifactUploader;
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
  const uploader = dependencies.uploadHtmlArtifact ?? uploadHtmlArtifact;
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
  const outputHtml = getBooleanInput("output-html");
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

  if (outputHtml) {
    info("Create HTML timeline report...");
    const workflowModel = await fetchWorkflowModelSafe(client, workflowRun);
    const html = createHtmlReport(workflowRun, jobs, {
      showWaitingRunner,
      workflowModel,
    });
    const uniqueJobKey =
      resolveCurrentJobId(workflowJobs, env.RUNNER_NAME) ?? env.RUNNER_NAME;
    const artifactName = resolveHtmlArtifactName(
      env.GITHUB_JOB,
      runAttempt,
      uniqueJobKey,
    );
    try {
      const uploaded = await uploader(html, artifactName);
      const artifactUrl = buildArtifactUrl(
        workflowRun,
        repository,
        uploaded.artifactId,
        env.GITHUB_SERVER_URL,
      );
      summary.addRaw(
        `### Interactive HTML Timeline\n\n[Open interactive HTML timeline (\`${uploaded.artifactName}\`)](${artifactUrl})\n\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warning(`Failed to upload HTML timeline artifact: ${message}`);
    }
  }

  info("Create gantt mermaid diagram...");
  const gantt = createMermaid(workflowRun, jobs, { showWaitingRunner });
  if (parallelResult.warnings.length > 0) {
    summary.addRaw(PARALLEL_FALLBACK_SUMMARY);
  }
  summary.addRaw(gantt);
  debug(gantt);

  await summary.write();
  info("Complete!");
}

async function fetchWorkflowModelSafe(
  client: Github,
  workflowRun: WorkflowRun,
): Promise<WorkflowModel | undefined> {
  if (typeof client.fetchWorkflowFiles !== "function") return undefined;
  try {
    const [fileContent] = await client.fetchWorkflowFiles([workflowRun]);
    return fileContent ? new WorkflowModel(fileContent) : undefined;
  } catch {
    return undefined;
  }
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
