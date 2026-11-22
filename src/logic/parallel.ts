import type {
  Github,
  WorkflowJobStep,
  WorkflowJobs,
  WorkflowRun,
} from "../github/github.ts";
import type { TimelineJobs, TimelineStep } from "../models/types.ts";

const PARALLEL_GROUP_NAME = "Parallel group";
const WAITING_MESSAGE = "Waiting for background step(s) to complete:";
const LOG_TIMESTAMP_PATTERN = String.raw`(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)`;
const START_TIME_TOLERANCE_MS = 1000;

type ParallelGroup = {
  parentIndex: number;
  childIndexes: number[];
  markerIndex: number;
};

type CandidateParent = Omit<ParallelGroup, "markerIndex">;

type WaitingMarker = {
  startedAt: Date;
  childNames: string;
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

function findParallelCandidateIndexes(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
  parentIndex: number,
): number[] {
  const parent = steps[parentIndex];
  if (parent.name !== PARALLEL_GROUP_NAME || !hasTimestamps(parent)) return [];

  const parentStart = new Date(parent.started_at).getTime();
  const parentEnd = new Date(parent.completed_at).getTime();
  if (!Number.isFinite(parentStart) || !Number.isFinite(parentEnd)) return [];

  const precedingSteps = steps.slice(0, parentIndex);
  const lastNonChildIndex = precedingSteps.findLastIndex((step) => {
    if (step.number >= parent.number) return true;
    const childEnd =
      step.completed_at === null ? null : new Date(step.completed_at).getTime();
    if (step.conclusion === "skipped") {
      return (
        childEnd !== null &&
        (!Number.isFinite(childEnd) || childEnd > parentEnd)
      );
    }
    if (!hasTimestamps(step) || childEnd === null) return true;

    const childStart = new Date(step.started_at).getTime();
    return (
      !Number.isFinite(childStart) ||
      !Number.isFinite(childEnd) ||
      Math.abs(childStart - parentStart) > START_TIME_TOLERANCE_MS ||
      childEnd > parentEnd
    );
  });
  return precedingSteps
    .slice(lastNonChildIndex + 1)
    .map((_step, index) => lastNonChildIndex + 1 + index);
}

function matchesParallelGroup(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
  parentIndex: number,
  childIndexes: number[],
  marker: WaitingMarker,
  markerIndex: number,
): boolean {
  const parent = steps[parentIndex];
  if (!hasTimestamps(parent)) return false;

  const parentStart = new Date(parent.started_at).getTime();
  const parentEnd = new Date(parent.completed_at).getTime() + 1000;
  const markerStart = marker.startedAt.getTime();
  if (
    !Number.isFinite(parentStart) ||
    !Number.isFinite(parentEnd) ||
    !Number.isFinite(markerStart) ||
    markerStart < parentStart ||
    markerStart > parentEnd
  ) {
    return false;
  }

  // Match whole API names instead of splitting the marker, since names can contain commas.
  let offsets = new Set([0]);
  for (const [childOffset, childIndex] of childIndexes.entries()) {
    const child = steps[childIndex];
    const names =
      child.conclusion === "skipped"
        ? [child.name, `__parallel_${markerIndex}_${childOffset}`]
        : [child.name];
    const separator = childOffset === childIndexes.length - 1 ? "" : ", ";
    offsets = new Set(
      [...offsets].flatMap((offset) =>
        names.flatMap((name) => {
          const text = `${name}${separator}`;
          return marker.childNames.startsWith(text, offset)
            ? [offset + text.length]
            : [];
        }),
      ),
    );
    if (offsets.size === 0) return false;
  }
  return offsets.has(marker.childNames.length);
}

function identifyParallelGroups(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
  markers: WaitingMarker[],
  candidates: CandidateParent[],
): ParallelGroup[] {
  const matches = markers.map((marker, markerIndex) =>
    candidates.flatMap(({ parentIndex, childIndexes }) =>
      childIndexes.flatMap((_index, offset): ParallelGroup[] => {
        const suffix = childIndexes.slice(offset);
        return matchesParallelGroup(
          steps,
          parentIndex,
          suffix,
          marker,
          markerIndex,
        )
          ? [{ parentIndex, childIndexes: suffix, markerIndex }]
          : [];
      }),
    ),
  );
  // Retain at most two ordered, non-overlapping assignments; two means ambiguous.
  const memo = new Map<string, ParallelGroup[][]>();
  const findSolutions = (
    markerIndex: number,
    previousParentIndex: number,
  ): ParallelGroup[][] => {
    if (markerIndex === markers.length) return [[]];
    const key = `${markerIndex},${previousParentIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const solutions: ParallelGroup[][] = [];
    for (const match of matches[markerIndex]) {
      if (match.childIndexes[0] <= previousParentIndex) continue;
      for (const rest of findSolutions(markerIndex + 1, match.parentIndex)) {
        solutions.push([match, ...rest]);
        if (solutions.length === 2) {
          memo.set(key, solutions);
          return solutions;
        }
      }
    }
    memo.set(key, solutions);
    return solutions;
  };
  const solutions = findSolutions(0, -1);
  return solutions.length === 1 ? solutions[0] : [];
}

function parseWaitingMarkers(logText: string): WaitingMarker[] {
  const markerRegex = new RegExp(
    `${LOG_TIMESTAMP_PATTERN}.*${WAITING_MESSAGE.replace(
      /[()]/g,
      String.raw`\$&`,
    )}\\s*(.+)$`,
  );

  return logText.split(/\r?\n/).flatMap((line) => {
    const match = line.match(markerRegex);
    return match
      ? [
          {
            startedAt: new Date(match[1]),
            childNames: match[2].trim(),
          },
        ]
      : [];
  });
}

function validateParallelGroups(
  steps: NonNullable<WorkflowJobs[number]["steps"]>,
  groups: ParallelGroup[],
  markers: WaitingMarker[],
): string | undefined {
  const invalidGroup = groups.find(
    ({ parentIndex, childIndexes, markerIndex }, index) => {
      const marker = markers[markerIndex];
      return (
        markerIndex !== index ||
        marker === undefined ||
        !matchesParallelGroup(
          steps,
          parentIndex,
          childIndexes,
          marker,
          markerIndex,
        )
      );
    },
  );

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
  const markers = parseWaitingMarkers(logText);
  const candidateParents = steps.flatMap((_step, parentIndex) => {
    const childIndexes = findParallelCandidateIndexes(steps, parentIndex);
    return childIndexes.length > 0 ? [{ parentIndex, childIndexes }] : [];
  });
  const groups = identifyParallelGroups(steps, markers, candidateParents);
  const childIndexes = new Set(groups.flatMap((group) => group.childIndexes));
  const parentIndexes = new Set(groups.map((group) => group.parentIndex));
  // A step immediately after a confirmed parent has no preceding child of its own.
  const apiCandidateCount = candidateParents.filter(
    ({ parentIndex }) =>
      !childIndexes.has(parentIndex) && !parentIndexes.has(parentIndex - 1),
  ).length;
  if (groups.length !== markers.length || groups.length !== apiCandidateCount) {
    return {
      steps,
      warning: "Could not correlate parallel groups between API steps and logs",
    };
  }

  const warning = validateParallelGroups(steps, groups, markers);
  if (warning) return { steps, warning };

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
    job.steps?.some((step) => step.name === PARALLEL_GROUP_NAME),
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
