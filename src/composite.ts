import { decodeBase64 } from "@std/encoding";
import { parse as parseYaml } from "@std/yaml";
import {
  type CompositeAction,
  Github,
  JobModel,
  StepModel,
  type WorkflowJobs,
  WorkflowModel,
  type WorkflowRun,
} from "@kesin11/gha-utils";

type CompositeStepInfo = {
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

// Fetch file content via Octokit, decoding base64 with newline removal
// Workaround for gha-utils FileContent constructor failing on base64 with newlines
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
  } catch (_error) {
    console.warn(
      `fetchFileContent not found: ref: ${ref}, path: ${owner}/${repo}/${path}`,
    );
  }
  return undefined;
}

// Fetch workflow YAML and parse it into WorkflowModel
async function fetchWorkflowModel(
  client: Github,
  workflowRun: WorkflowRun,
): Promise<WorkflowModel | undefined> {
  // Use fetchWorkflowFiles which handles path/ref extraction from WorkflowRun
  const fileContents = await client.fetchWorkflowFiles([workflowRun]);
  const fileContent = fileContents[0];
  if (fileContent) return new WorkflowModel(fileContent);

  // Fallback: fetch directly with newline-safe base64 decoding
  const owner = workflowRun.repository.owner.login;
  const repo = workflowRun.repository.name;
  const content = await fetchFileContent(
    client,
    owner,
    repo,
    workflowRun.path,
    workflowRun.head_sha,
  );
  if (!content) return undefined;

  // Create a minimal FileContent-like object for WorkflowModel
  // WorkflowModel constructor needs fileContent.content (string) and fileContent.raw.html_url
  const { FileContent } = await import("@kesin11/gha-utils");
  // Build a fake FileContentResponse to construct FileContent without the base64 issue
  const fakeResponse = {
    type: "file" as const,
    size: content.length,
    name: workflowRun.path.split("/").pop() ?? "",
    path: workflowRun.path,
    content: "", // Not used after construction - we override below
    sha: "",
    url: "",
    git_url: null,
    html_url: null,
    download_url: null,
  };
  // Create FileContent but override the content with our properly decoded string
  const fc = Object.create(FileContent.prototype);
  fc.raw = fakeResponse;
  fc.content = content;
  return new WorkflowModel(fc);
}

// Identify composite steps in each job by matching API steps against YAML model
function identifyCompositeSteps(
  workflowJobs: WorkflowJobs,
  workflowModel: WorkflowModel,
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
      let stepModel = StepModel.match(jobModel.steps, apiStep.name);
      // GitHub API sometimes returns local action paths with extra "/" prefix
      // e.g. "Run /./.github/actions/foo" instead of "Run ./.github/actions/foo"
      if (!stepModel) {
        const normalized = apiStep.name.replace(
          /^((?:Pre Run |Post Run |Pre |Run |Post )?)\/\.\//,
          "$1./",
        );
        if (normalized !== apiStep.name) {
          stepModel = StepModel.match(jobModel.steps, normalized);
        }
      }
      if (stepModel?.isComposite() && stepModel.raw.uses) {
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

// Fetch composite action's action.yml, parse it and return the step count.
// Returns undefined if the file can't be fetched or parsed.
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
      // If any step uses a nested local composite (uses: ./...), step count
      // can't predict the actual number of log blocks. Return undefined to
      // fall back to time-based extraction.
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

// Fetch job logs via GitHub API (using redirect to download URL)
async function fetchJobLog(
  token: string,
  baseUrl: string,
  owner: string,
  repo: string,
  jobId: number,
): Promise<string | undefined> {
  const apiUrl = `${baseUrl}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.warn(
        `Failed to fetch job log for job ${jobId}: ${response.status}`,
      );
      return undefined;
    }

    return await response.text();
  } catch (error) {
    console.warn(`Error fetching job log for job ${jobId}:`, error);
    return undefined;
  }
}

// Parse ##[group] blocks from job log text to extract step boundaries
export function parseLogBlocks(logText: string): LogBlock[] {
  const blocks: LogBlock[] = [];
  // Log lines format: "2024-01-01T00:00:00.0000000Z ##[group]Step name"
  const groupRegex =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+##\[group\](.+)$/;

  for (const line of logText.split("\n")) {
    const match = line.match(groupRegex);
    if (match) {
      blocks.push({
        name: match[2],
        startedAt: new Date(match[1]),
      });
    }
  }

  return blocks;
}

// Extract sub-steps from log blocks for a composite action step.
// Uses position-based extraction: finds the composite header by path match,
// then takes blocks using expectedStepCount from the action.yml.
//
// Limitation: Composite actions containing nested local composites (uses: ./...)
// are not supported — expectedStepCount will be undefined and expansion is skipped.
export function extractSubSteps(
  logBlocks: LogBlock[],
  compositeStartedAt: string,
  compositeCompletedAt: string,
  compositeStatus: string,
  compositeConclusion: string | null,
  compositeUsesPath?: string,
  expectedStepCount?: number,
): SubStep[] {
  if (expectedStepCount === undefined || expectedStepCount <= 0) {
    return [];
  }

  const compositeStart = new Date(compositeStartedAt).getTime();
  // GitHub API timestamps have second precision (truncated), while log timestamps
  // have millisecond precision. Use generous buffer for header search.
  const compositeEnd = new Date(compositeCompletedAt).getTime() + 1000;

  // Find the composite header block by matching the uses path in the full log
  let headerGlobalIndex = -1;
  if (compositeUsesPath) {
    const pathWithoutPrefix = compositeUsesPath.replace(/^\.\//, "");
    headerGlobalIndex = logBlocks.findIndex(
      (block) =>
        block.startedAt.getTime() >= compositeStart &&
        block.startedAt.getTime() <= compositeEnd &&
        (block.name.includes(compositeUsesPath) ||
          block.name.includes(pathWithoutPrefix)),
    );
  }

  if (headerGlobalIndex < 0) {
    return [];
  }

  // Collect sub-step blocks after the header.
  // Each YAML step in the composite emits a primary ##[group] block starting
  // with "Run ", but some actions (e.g. setup-node) also emit auxiliary blocks
  // (e.g. "Environment details"). We count primary blocks up to expectedStepCount,
  // including any auxiliary blocks in between and after.
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
    // For the last sub-step, use max(compositeCompletedAt, startedAt) to avoid
    // negative duration when API's truncated second-precision time < log's ms time.
    let completedAt: string;
    if (i < subStepBlocks.length - 1) {
      completedAt = subStepBlocks[i + 1].startedAt.toISOString();
    } else {
      const compositeEndTime = new Date(compositeCompletedAt).getTime();
      const blockStartTime = block.startedAt.getTime();
      completedAt = blockStartTime > compositeEndTime
        ? startedAt
        : compositeCompletedAt;
    }

    // Remove "Run " prefix from sub-step names for cleaner display
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
): Promise<WorkflowJobs> {
  // Step 1: Fetch and parse workflow YAML
  const workflowModel = await fetchWorkflowModel(client, workflowRun);
  if (!workflowModel) {
    console.warn("Could not fetch workflow YAML, skipping composite expansion");
    return workflowJobs;
  }

  // Step 2: Identify composite steps in each job
  const compositeMap = identifyCompositeSteps(workflowJobs, workflowModel);
  if (compositeMap.size === 0) {
    return workflowJobs;
  }

  const owner = workflowRun.repository.owner.login;
  const repo = workflowRun.repository.name;
  const ref = workflowRun.head_sha;

  // Step 3: Fetch composite action YAMLs (to validate they are actually composite)
  // and job logs (only for jobs with composite steps)
  const jobsWithComposites = workflowJobs.filter((job) =>
    compositeMap.has(job.id)
  );

  // Collect unique composite action paths
  const uniqueUsesPathSet = new Set<string>();
  for (const infos of compositeMap.values()) {
    for (const info of infos) {
      uniqueUsesPathSet.add(info.usesPath);
    }
  }

  // Fetch and parse composite action YAMLs to get step counts
  const compositeYamlPromises = [...uniqueUsesPathSet].map(async (usesPath) => {
    const stepCount = await fetchCompositeActionStepCount(
      client,
      owner,
      repo,
      ref,
      usesPath,
    );
    return [usesPath, stepCount] as const;
  });
  const compositeYamlResults = await Promise.all(compositeYamlPromises);
  // Map from usesPath to step count (undefined means fetch/parse failed)
  const compositeStepCounts = new Map(
    compositeYamlResults
      .filter(([_, count]) => count !== undefined)
      .map(([path, count]) => [path, count!]),
  );

  // Fetch job logs in parallel (only for jobs with composite steps)
  const token = client.token ?? "";
  const baseUrl = client.baseUrl;
  const logPromises = jobsWithComposites.map(async (job) => {
    const log = await fetchJobLog(token, baseUrl, owner, repo, job.id);
    return [job.id, log] as const;
  });
  const logResults = await Promise.all(logPromises);
  const logMap = new Map(logResults);

  // Step 4: Parse logs and expand composite steps
  const expandedJobs: WorkflowJobs = workflowJobs.map((job) => {
    const compositeInfos = compositeMap.get(job.id);
    if (!compositeInfos || !job.steps) return job;

    const logText = logMap.get(job.id);
    if (!logText) return job;

    const logBlocks = parseLogBlocks(logText);
    if (logBlocks.length === 0) return job;

    // Build new steps array, replacing composite steps with sub-steps
    const newSteps: NonNullable<typeof job.steps> = [];

    for (let i = 0; i < job.steps.length; i++) {
      const compositeInfo = compositeInfos.find((c) => c.apiStepIndex === i);

      if (
        !compositeInfo || !compositeStepCounts.has(compositeInfo.usesPath)
      ) {
        newSteps.push(job.steps[i]);
        continue;
      }

      const apiStep = job.steps[i];
      if (!apiStep.started_at || !apiStep.completed_at) {
        newSteps.push(apiStep);
        continue;
      }

      const expectedStepCount = compositeStepCounts.get(
        compositeInfo.usesPath,
      );

      const subSteps = extractSubSteps(
        logBlocks,
        apiStep.started_at,
        apiStep.completed_at,
        apiStep.status,
        apiStep.conclusion,
        compositeInfo.usesPath,
        expectedStepCount,
      );

      if (subSteps.length === 0) {
        newSteps.push(apiStep);
        continue;
      }

      // Replace composite step with its sub-steps
      for (const subStep of subSteps) {
        newSteps.push({
          ...apiStep,
          name: `(sub) ${subStep.name}`,
          started_at: subStep.started_at,
          completed_at: subStep.completed_at,
          number: apiStep.number,
        });
      }
    }

    return { ...job, steps: newSteps };
  });

  return expandedJobs;
}
