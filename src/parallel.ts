import type { WorkflowJobs, WorkflowJobStep, WorkflowRun } from "./github.ts";
import { Github } from "./github.ts";
import type { TimelineJobs, TimelineStep } from "./types.ts";

const PARALLEL_GROUP_NAME = "Parallel group";
const WAITING_MESSAGE = "Waiting for background step(s) to complete:";
const LOG_TIMESTAMP_PATTERN = String
  .raw`(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)`;

type ParallelGroup = {
  parentIndex: number;
  childIndexes: number[];
};

type JobLogResult =
  | { jobId: number; logText: string }
  | { jobId: number; error: string };

export type ParallelExpansionWarning = {
  jobId: number;
  jobName: string;
  reason: string;
};

export type ParallelExpansionResult = {
  jobs: TimelineJobs;
  warnings: ParallelExpansionWarning[];
};

const hasTimestamps = (
  step: WorkflowJobStep,
): step is WorkflowJobStep & {
  started_at: string;
  completed_at: string;
} => step.started_at !== null && step.completed_at !== null;

function identifyParallelGroups(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
): ParallelGroup[] {
  return steps.flatMap((parent, parentIndex): ParallelGroup[] => {
    if (parent.name !== PARALLEL_GROUP_NAME || !hasTimestamps(parent)) {
      return [];
    }

    const precedingSteps = steps.slice(0, parentIndex);
    const lastNonChildIndex = precedingSteps.findLastIndex((step) =>
      !hasTimestamps(step) ||
      step.started_at !== parent.started_at ||
      new Date(step.completed_at).getTime() >
        new Date(parent.completed_at).getTime()
    );
    const childIndexes = precedingSteps
      .slice(lastNonChildIndex + 1)
      .map((_step, index) => lastNonChildIndex + 1 + index);

    return childIndexes.length > 0 ? [{ parentIndex, childIndexes }] : [];
  });
}

function parseWaitingMarkers(
  logText: string,
): Array<{ startedAt: Date; childNames: string }> {
  const markerRegex = new RegExp(
    `${LOG_TIMESTAMP_PATTERN}.*${
      WAITING_MESSAGE.replace(/[()]/g, String.raw`\$&`)
    }\\s*(.+)$`,
  );

  return logText.split(/\r?\n/).flatMap((line) => {
    const match = line.match(markerRegex);
    return match
      ? [{
        startedAt: new Date(match[1]),
        childNames: match[2].trim(),
      }]
      : [];
  });
}

function validateParallelGroups(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
  groups: ParallelGroup[],
  logText: string,
): string | undefined {
  const markers = parseWaitingMarkers(logText);

  const invalidGroup = groups.find(({ parentIndex, childIndexes }) => {
    const parent = steps[parentIndex];
    if (!hasTimestamps(parent)) return true;

    const expectedNames = childIndexes.map((index) => steps[index].name).join(
      ", ",
    );
    const parentStart = new Date(parent.started_at).getTime();
    const parentEnd = new Date(parent.completed_at).getTime() + 1000;

    return !markers.some((marker) =>
      marker.childNames === expectedNames &&
      marker.startedAt.getTime() >= parentStart &&
      marker.startedAt.getTime() <= parentEnd
    );
  });

  return invalidGroup === undefined
    ? undefined
    : `Could not match API steps for parallel group at step ${
      invalidGroup.parentIndex + 1
    } with the job log`;
}

export function expandParallelJobSteps(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
  logText: string,
): { steps: TimelineStep[]; warning?: string } {
  const groups = identifyParallelGroups(steps);
  const parallelGroupCount =
    steps.filter((step) => step.name === PARALLEL_GROUP_NAME).length;
  if (groups.length !== parallelGroupCount) {
    return {
      steps,
      warning: "Could not identify parallel child steps from API timestamps",
    };
  }

  const warning = validateParallelGroups(steps, groups, logText);
  if (warning) return { steps, warning };

  const childIndexes = new Set(groups.flatMap((group) => group.childIndexes));
  const groupsByParentIndex = new Map(
    groups.map((group) => [group.parentIndex, group]),
  );

  return {
    steps: steps.flatMap((step, index): TimelineStep[] => {
      if (childIndexes.has(index)) return [];

      const group = groupsByParentIndex.get(index);
      if (!group) return [step];

      return [
        { ...step, timelineRowKind: "parallel-parent" },
        ...group.childIndexes.map((childIndex) => ({
          ...steps[childIndex],
          name: `(bg) ${steps[childIndex].name}`,
          timelineOriginalName: steps[childIndex].name,
          timelineRowKind: "parallel-child" as const,
        })),
      ];
    }),
  };
}

export async function expandParallelSteps(
  client: Pick<Github, "fetchJobLog">,
  workflowRun: WorkflowRun,
  workflowJobs: WorkflowJobs,
): Promise<ParallelExpansionResult> {
  const jobsWithParallelGroups = workflowJobs.filter((job) =>
    job.steps?.some((step) => step.name === PARALLEL_GROUP_NAME)
  );
  if (jobsWithParallelGroups.length === 0) {
    return { jobs: workflowJobs, warnings: [] };
  }

  const owner = workflowRun.repository.owner.login;
  const repo = workflowRun.repository.name;
  const logResults: JobLogResult[] = await Promise.all(
    jobsWithParallelGroups.map(async (job): Promise<JobLogResult> => {
      try {
        return {
          jobId: job.id,
          logText: await client.fetchJobLog(owner, repo, job.id),
        };
      } catch (error) {
        return {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  const logsByJobId = new Map(
    logResults.map((result) => [result.jobId, result]),
  );
  const warnings: ParallelExpansionWarning[] = [];

  const jobs: TimelineJobs = workflowJobs.map((job) => {
    if (!job.steps || !logsByJobId.has(job.id)) return job;

    const logResult = logsByJobId.get(job.id)!;
    if (!("logText" in logResult)) {
      warnings.push({
        jobId: job.id,
        jobName: job.name,
        reason: `Could not download the job log: ${logResult.error}`,
      });
      return job;
    }

    const expanded = expandParallelJobSteps(job.steps, logResult.logText);
    if (expanded.warning) {
      warnings.push({
        jobId: job.id,
        jobName: job.name,
        reason: expanded.warning,
      });
      return job;
    }

    return { ...job, steps: expanded.steps };
  });

  return { jobs, warnings };
}
