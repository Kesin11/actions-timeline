import { decodeBase64 } from "@std/encoding";
import { parse as parseYaml } from "@std/yaml";
import { diffSec } from "./format_util.ts";
import type { TimelineJobs, TimelineStep } from "./types.ts";
import {
  type CompositeAction,
  Github,
  JobModel,
  StepModel,
  type WorkflowJobs,
  WorkflowModel,
  type WorkflowRun,
} from "@kesin11/gha-utils";

export type ExpandCompositeOptions = {
  thresholdSec?: number; // default: 20
};

export type CompositeStepInfo = {
  apiStepIndex: number;
  apiStepName: string;
  usesPath: string;
  status: string;
  conclusion: string | null;
};

export type LogBlock = {
  name: string;
  startedAt: Date;
};

type SubStep = {
  name: string;
  started_at: string;
  completed_at: string;
  status: string;
  conclusion: string | null;
};

// Fetch file content via Octokit, decoding base64 manually.
// Used by fetchCompositeActionStepCount to get action.yml for local composite actions.
async function fetchFileContent(
  client: Github,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | undefined> {
  try {
    const res = await client.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if (!Array.isArray(res.data) && res.data.type === "file") {
      // GitHub API returns base64 with newlines, strip them before decoding
      const base64 = (res.data.content ?? "").replace(/\n/g, "");
      const textDecoder = new TextDecoder();
      return textDecoder.decode(decodeBase64(base64));
    }
  } catch (error) {
    console.warn(
      `fetchFileContent failed: ref: ${ref}, path: ${owner}/${repo}/${path}`,
      error,
    );
  }
  return undefined;
}

// Fetch workflow YAML and parse it into a WorkflowModel.
async function fetchWorkflowModel(
  client: Github,
  workflowRun: WorkflowRun,
): Promise<WorkflowModel | undefined> {
  const fileContents = await client.fetchWorkflowFiles([workflowRun]);
  const fileContent = fileContents[0];
  if (fileContent) return new WorkflowModel(fileContent);
  return undefined;
}

// Identify composite steps in each job by matching API steps against the YAML model.
export function identifyCompositeSteps(
  workflowJobs: WorkflowJobs,
  workflowModel: WorkflowModel,
  thresholdSec: number,
): Map<number, CompositeStepInfo[]> {
  const result = new Map<number, CompositeStepInfo[]>();

  for (const job of workflowJobs) {
    if (!job.steps) continue;

    const jobModel = JobModel.match(workflowModel.jobs, job.name);
    if (!jobModel) continue;

    const compositeSteps: CompositeStepInfo[] = [];
    for (let i = 0; i < job.steps.length; i++) {
      const apiStep = job.steps[i];
      // Skip Pre/Post steps - only expand the main "Run" execution step
      if (/^(Pre Run |Post Run |Pre |Post )/.test(apiStep.name)) continue;
      const stepModel = StepModel.match(jobModel.steps, apiStep.name);
      if (stepModel?.isComposite() && stepModel.raw.uses) {
        if (
          diffSec(apiStep.started_at, apiStep.completed_at) < thresholdSec
        ) {
          continue;
        }

        compositeSteps.push({
          apiStepIndex: i,
          apiStepName: apiStep.name,
          usesPath: stepModel.raw.uses,
          status: apiStep.status,
          conclusion: apiStep.conclusion,
        });
      }
    }

    if (compositeSteps.length > 0) {
      result.set(job.id, compositeSteps);
    }
  }

  return result;
}

// Fetch a composite action's action.yml and return the number of steps.
// Returns undefined if the file cannot be fetched, parsed, or contains nested local composites.
async function fetchCompositeActionStepCount(
  client: Github,
  owner: string,
  repo: string,
  ref: string,
  usesPath: string,
): Promise<number | undefined> {
  // usesPath is like "./.github/actions/foo", strip leading "./"
  const basePath = usesPath.replace(/^\.\//, "");

  let content = await fetchFileContent(
    client,
    owner,
    repo,
    `${basePath}/action.yml`,
    ref,
  );
  if (!content) {
    content = await fetchFileContent(
      client,
      owner,
      repo,
      `${basePath}/action.yaml`,
      ref,
    );
  }
  if (!content) return undefined;

  try {
    const parsed = parseYaml(content) as CompositeAction;
    if (
      parsed?.runs?.using === "composite" && Array.isArray(parsed.runs.steps)
    ) {
      // Nested local composites make step count unpredictable; skip expansion.
      const hasNestedLocal = parsed.runs.steps.some(
        (step) => typeof step.uses === "string" && step.uses.startsWith("./"),
      );
      if (hasNestedLocal) return undefined;
      return parsed.runs.steps.length;
    }
  } catch {
    console.warn(`Failed to parse action.yml for ${usesPath}`);
  }
  return undefined;
}

// Fetch job logs via Octokit REST API.
async function fetchJobLog(
  client: Github,
  owner: string,
  repo: string,
  jobId: number,
): Promise<string | undefined> {
  try {
    const res = await client.octokit.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: jobId,
    });
    return res.data as unknown as string;
  } catch (error) {
    console.warn(`Error fetching job log for job ${jobId}:`, error);
    return undefined;
  }
}

// Parse ##[group] blocks from job log text to extract step boundaries.
// Log line format: "2024-01-01T00:00:00.0000000Z ##[group]Step name"
export function parseLogBlocks(logText: string): LogBlock[] {
  const blocks: LogBlock[] = [];
  const groupRegex =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+##\[group\](.+)$/;

  for (const line of logText.split(/\r?\n/)) {
    const match = line.match(groupRegex);
    if (match) {
      blocks.push({
        name: match[2].trim(),
        startedAt: new Date(match[1]),
      });
    }
  }

  return blocks;
}

// Extract sub-steps from log blocks for a composite action step.
// Finds the composite header by path match, then takes blocks using expectedStepCount.
export function extractSubSteps(
  logBlocks: LogBlock[],
  compositeStartedAt: string,
  compositeCompletedAt: string,
  compositeStatus: string,
  compositeConclusion: string | null,
  compositeUsesPath: string,
  expectedStepCount: number,
): SubStep[] {
  if (expectedStepCount <= 0) {
    return [];
  }

  const compositeStart = new Date(compositeStartedAt).getTime();
  // Add 1s buffer: API timestamps have second precision, logs have millisecond precision.
  const compositeEnd = new Date(compositeCompletedAt).getTime() + 1000;

  const pathWithoutPrefix = compositeUsesPath.replace(/^\.\//, "");
  const headerGlobalIndex = logBlocks.findIndex(
    (block) =>
      block.startedAt.getTime() >= compositeStart &&
      block.startedAt.getTime() <= compositeEnd &&
      (block.name.includes(compositeUsesPath) ||
        block.name.includes(pathWithoutPrefix)),
  );

  if (headerGlobalIndex < 0) {
    return [];
  }

  // Collect sub-step blocks after the header. Primary blocks start with "Run ";
  // auxiliary blocks (e.g. "Environment details") are included between primaries.
  const subStepBlocks: LogBlock[] = [];
  let primaryCount = 0;
  for (let i = headerGlobalIndex + 1; i < logBlocks.length; i++) {
    const block = logBlocks[i];
    const isPrimary = block.name.startsWith("Run ");
    // Stop when we encounter a new primary block beyond the expected count
    if (isPrimary && primaryCount >= expectedStepCount) break;
    subStepBlocks.push(block);
    if (isPrimary) primaryCount++;
  }

  if (subStepBlocks.length === 0) {
    return [];
  }

  return subStepBlocks.map((block, i): SubStep => {
    const startedAt = block.startedAt.toISOString();
    const isLast = i === subStepBlocks.length - 1;

    let completedAt: string;
    if (!isLast) {
      completedAt = subStepBlocks[i + 1].startedAt.toISOString();
    } else {
      // Clamp to avoid negative duration when API's truncated timestamp < log's ms timestamp.
      const compositeEndTime = new Date(compositeCompletedAt).getTime();
      completedAt = block.startedAt.getTime() > compositeEndTime
        ? startedAt
        : compositeCompletedAt;
    }

    const name = block.name.replace(/^Run /, "");

    return {
      name,
      started_at: startedAt,
      completed_at: completedAt,
      status: compositeStatus,
      conclusion: compositeConclusion,
    };
  });
}

export function expandJobSteps(
  steps: NonNullable<WorkflowJobs[0]["steps"]>,
  compositeInfos: CompositeStepInfo[],
  compositeStepCounts: Map<string, number>,
  logBlocks: LogBlock[],
): TimelineStep[] {
  const compositeInfoByIndex = new Map(
    compositeInfos.map((info) => [info.apiStepIndex, info]),
  );

  const newSteps: TimelineStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const compositeInfo = compositeInfoByIndex.get(i);

    if (!compositeInfo || !compositeStepCounts.has(compositeInfo.usesPath)) {
      newSteps.push(steps[i]);
      continue;
    }

    const apiStep = steps[i];
    if (!apiStep.started_at || !apiStep.completed_at) {
      newSteps.push(apiStep);
      continue;
    }

    const expectedStepCount = compositeStepCounts.get(compositeInfo.usesPath)!;

    const subSteps = extractSubSteps(
      logBlocks,
      apiStep.started_at,
      apiStep.completed_at,
      apiStep.status,
      apiStep.conclusion,
      compositeInfo.usesPath,
      expectedStepCount,
    );

    newSteps.push(apiStep);
    if (subSteps.length === 0) {
      continue;
    }

    subSteps.forEach((subStep) => {
      newSteps.push({
        ...apiStep,
        name: `(sub) ${subStep.name}`,
        started_at: subStep.started_at,
        completed_at: subStep.completed_at,
        number: apiStep.number,
        timelineRowKind: "composite-child",
      });
    });
  }

  return newSteps;
}

/**
 * Expand composite action steps in workflowJobs.
 * Returns a new WorkflowJobs with composite steps replaced by their sub-steps.
 *
 * Limitation: Composite actions that contain nested local composite actions
 * (uses: ./.github/actions/...) are not expanded because the step count from
 * the top-level action.yml cannot predict the actual number of log blocks
 * produced by nested composites.
 */
export async function expandCompositeSteps(
  client: Github,
  workflowRun: WorkflowRun,
  workflowJobs: WorkflowJobs,
  options: ExpandCompositeOptions = {},
): Promise<TimelineJobs> {
  const thresholdSec = options.thresholdSec ?? 20;

  const workflowModel = await fetchWorkflowModel(client, workflowRun);
  if (!workflowModel) {
    console.warn("Could not fetch workflow YAML, skipping composite expansion");
    return workflowJobs;
  }

  const compositeMap = identifyCompositeSteps(
    workflowJobs,
    workflowModel,
    thresholdSec,
  );
  if (compositeMap.size === 0) {
    return workflowJobs;
  }

  const owner = workflowRun.repository.owner.login;
  const repo = workflowRun.repository.name;
  const ref = workflowRun.head_sha;

  const jobsWithComposites = workflowJobs.filter((job) =>
    compositeMap.has(job.id)
  );

  // Collect unique uses paths across all jobs
  const uniqueUsesPaths = new Set(
    [...compositeMap.values()].flatMap((infos) =>
      infos.map((info) => info.usesPath)
    ),
  );

  // Fetch and parse composite action YAMLs to get step counts
  const compositeYamlResults = await Promise.all(
    [...uniqueUsesPaths].map(async (usesPath) => {
      const stepCount = await fetchCompositeActionStepCount(
        client,
        owner,
        repo,
        ref,
        usesPath,
      );
      return [usesPath, stepCount] as const;
    }),
  );
  const compositeStepCounts = new Map(
    compositeYamlResults.filter(
      (entry): entry is [string, number] => entry[1] !== undefined,
    ),
  );

  // Fetch job logs in parallel
  const logResults = await Promise.all(
    jobsWithComposites.map(async (job) => {
      const log = await fetchJobLog(client, owner, repo, job.id);
      return [job.id, log] as const;
    }),
  );
  const logMap = new Map(logResults);

  const expandedJobs: TimelineJobs = workflowJobs.map((job) => {
    const compositeInfos = compositeMap.get(job.id);
    if (!compositeInfos || !job.steps) return job;

    const logText = logMap.get(job.id);
    if (!logText) return job;

    const logBlocks = parseLogBlocks(logText);
    if (logBlocks.length === 0) return job;

    return {
      ...job,
      steps: expandJobSteps(
        job.steps,
        compositeInfos,
        compositeStepCounts,
        logBlocks,
      ),
    };
  });

  return expandedJobs;
}
