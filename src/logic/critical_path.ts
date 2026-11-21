import type { TimelineJob, TimelineJobs } from "../models/types.ts";
import { JobModel, type WorkflowModel } from "../models/workflow_file.ts";

export type TimedSpan = {
  start: number | null;
  end: number | null;
  conclusion: string | null;
};

const parseTimestampMs = (value: string | null | undefined): number | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const getJobEndMs = (job: TimelineJob): number | null => {
  if (job.conclusion === "skipped") return null;
  const completedMs = parseTimestampMs(job.completed_at);
  if (completedMs !== null) return completedMs;

  const stepEnds = (job.steps ?? [])
    .map((step) => parseTimestampMs(step.completed_at ?? step.started_at))
    .filter((ms): ms is number => ms !== null);
  if (stepEnds.length > 0) return Math.max(...stepEnds);

  return parseTimestampMs(job.started_at);
};

const getJobDurationMs = (job: TimelineJob, endMs: number): number => {
  const startMs = parseTimestampMs(job.started_at);
  if (startMs === null) return 0;
  return Math.max(0, endMs - startMs);
};

const pickLatestFinishingJob = (
  candidates: readonly { job: TimelineJob; index: number; endMs: number }[],
): { job: TimelineJob; index: number; endMs: number } | undefined => {
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, current) => {
    if (current.endMs !== best.endMs) {
      return current.endMs > best.endMs ? current : best;
    }
    const currentDur = getJobDurationMs(current.job, current.endMs);
    const bestDur = getJobDurationMs(best.job, best.endMs);
    if (currentDur !== bestDur) {
      return currentDur > bestDur ? current : best;
    }
    return current.index < best.index ? current : best;
  });
};

/**
 * Computes the set of job IDs on the deterministic critical path.
 * Starts from the latest-finishing non-skipped job and walks upstream
 * through `needs` declared in the workflow YAML, choosing the latest-finishing
 * dependency at each hop.
 */
export const computeCriticalPathJobIds = (
  jobs: TimelineJobs,
  workflowModel?: WorkflowModel,
): Set<number> => {
  const timedJobs = jobs
    .map((job, index) => {
      const endMs = getJobEndMs(job);
      return endMs === null ? undefined : { job, index, endMs };
    })
    .filter(
      (entry): entry is { job: TimelineJob; index: number; endMs: number } =>
        entry !== undefined,
    );

  const sink = pickLatestFinishingJob(timedJobs);
  if (sink === undefined) return new Set<number>();

  const cpJobIds = new Set<number>([sink.job.id]);
  if (workflowModel === undefined) return cpJobIds;

  const jobModels = workflowModel.jobs;
  if (jobModels.length === 0) return cpJobIds;

  const jobIdToModel = new Map<number, JobModel>();
  const modelIdToTimedJobs = new Map<
    string,
    { job: TimelineJob; index: number; endMs: number }[]
  >();

  for (const entry of timedJobs) {
    const model = JobModel.match(jobModels, entry.job.name);
    if (model === undefined) continue;
    jobIdToModel.set(entry.job.id, model);
    const list = modelIdToTimedJobs.get(model.id);
    if (list) {
      list.push(entry);
    } else {
      modelIdToTimedJobs.set(model.id, [entry]);
    }
  }

  let current = sink;
  while (true) {
    const currentModel = jobIdToModel.get(current.job.id);
    if (currentModel === undefined || currentModel.needs.length === 0) break;

    const upstreamCandidates = currentModel.needs
      .flatMap((needId) => modelIdToTimedJobs.get(needId) ?? [])
      .filter((candidate) => !cpJobIds.has(candidate.job.id));

    const next = pickLatestFinishingJob(upstreamCandidates);
    if (next === undefined) break;

    cpJobIds.add(next.job.id);
    current = next;
  }

  return cpJobIds;
};

/**
 * Picks the index of the critical-path child inside a parallel group:
 * the non-skipped child with the latest finish time (tie-break: longest duration,
 * then earliest index).
 */
export const pickCriticalParallelChildIndex = (
  children: readonly TimedSpan[],
): number => {
  let bestIndex = -1;
  let bestEnd = -Infinity;
  let bestDur = -Infinity;

  children.forEach((child, index) => {
    if (child.conclusion === "skipped") return;
    const end = child.end ?? child.start;
    if (end === null) return;
    const dur = child.start !== null ? Math.max(0, end - child.start) : 0;

    if (
      bestIndex === -1 ||
      end > bestEnd ||
      (end === bestEnd && dur > bestDur)
    ) {
      bestIndex = index;
      bestEnd = end;
      bestDur = dur;
    }
  });

  return bestIndex;
};
