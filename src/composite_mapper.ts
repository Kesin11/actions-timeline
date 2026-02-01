import type { WorkflowJobs } from "@kesin11/gha-utils";
import { type LogBlock, parseLogBlocks } from "./log_parser.ts";
import type { CompositeActionStep, JobLogs, ParsedLogStep } from "./types.ts";

// Pattern to detect repo-local composite action usage in step name
// e.g., "Run ./.github/actions/setup-deno-with-cache"
// Note: Jobs API may show "Run /./.github/actions/..." (with extra slash)
const REPO_LOCAL_COMPOSITE_PATTERN = /^Run \/?\.\/.github\/actions\//;

/**
 * Check if a step is a repo-local composite action.
 */
export const isRepoLocalCompositeStep = (stepName: string): boolean => {
  return REPO_LOCAL_COMPOSITE_PATTERN.test(stepName);
};

/**
 * Find all repo-local composite steps in workflow jobs.
 * Returns a map of job ID to array of step numbers that are composites.
 */
export const findRepoLocalCompositeSteps = (
  workflowJobs: WorkflowJobs,
): Map<number, number[]> => {
  const result = new Map<number, number[]>();

  for (const job of workflowJobs) {
    if (!job.steps) continue;

    const compositeStepNumbers: number[] = [];
    for (const step of job.steps) {
      if (isRepoLocalCompositeStep(step.name)) {
        compositeStepNumbers.push(step.number);
      }
    }

    if (compositeStepNumbers.length > 0) {
      result.set(job.id, compositeStepNumbers);
    }
  }

  return result;
};

// Pattern to detect repo-local composite action in log block name
// e.g., "./.github/actions/prepare"
const REPO_LOCAL_COMPOSITE_LOG_NAME_PATTERN = /^\.\/\.github\/actions\//;

/**
 * Check if a log block name is a repo-local composite action.
 */
const isCompositeLogBlock = (blockName: string): boolean => {
  return REPO_LOCAL_COMPOSITE_LOG_NAME_PATTERN.test(blockName);
};

/**
 * Parse job logs and map composite action inner steps to their parent steps.
 * Uses log blocks to detect composite actions (by ./.github/actions/ pattern)
 * and maps them to Jobs API steps using timestamps.
 * Returns a map of job ID to array of CompositeActionStep.
 */
export const parseCompositeActionsFromLogs = (
  workflowJobs: WorkflowJobs,
  jobLogs: JobLogs,
): Map<number, CompositeActionStep[]> => {
  const result = new Map<number, CompositeActionStep[]>();

  for (const job of workflowJobs) {
    if (!job.steps) continue;

    const logText = jobLogs.get(job.id);
    if (!logText) continue;

    // Parse all log blocks
    const logBlocks = parseLogBlocks(logText);

    // Sort log blocks by start time
    const sortedBlocks = [...logBlocks].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
    );

    // Find composite action log blocks and collect them
    const compositeLogBlocks = sortedBlocks.filter((block) =>
      isCompositeLogBlock(block.name)
    );

    // Match composite log blocks with Jobs API steps
    // Strategy: For each composite log block, find the best matching step
    // considering timestamp proximity and avoiding already-matched steps
    const compositeSteps: CompositeActionStep[] = [];
    const matchedStepNumbers = new Set<number>();

    for (let blockIdx = 0; blockIdx < compositeLogBlocks.length; blockIdx++) {
      const block = compositeLogBlocks[blockIdx];
      // Find the matching Jobs API step by timestamp
      // Exclude already matched steps
      const match = findMatchingStepExcluding(
        job.steps,
        block.startedAt,
        matchedStepNumbers,
        blockIdx,
        compositeLogBlocks.length,
      );
      if (!match) continue;

      const { step: parentStep, index: stepIdx } = match;
      matchedStepNumbers.add(parentStep.number);

      // Find the next step's started_at time to use as end boundary
      const nextStep = job.steps[stepIdx + 1];
      const nextStepStartedAt = nextStep?.started_at;

      // Find inner steps from log blocks that fall within this step's time window
      const innerSteps = findInnerStepsFromLogs(
        logBlocks,
        parentStep.started_at,
        block.name, // Use log block name (contains ./.github/actions/...)
        nextStepStartedAt,
      );

      if (innerSteps.length > 0) {
        compositeSteps.push({
          parentStepName: parentStep.name,
          parentStepNumber: parentStep.number,
          innerSteps,
        });
      }
    }

    if (compositeSteps.length > 0) {
      result.set(job.id, compositeSteps);
    }
  }

  return result;
};

/**
 * Find the Jobs API step that corresponds to a log block by matching timestamps.
 * When multiple steps have the same second, uses the step order to match
 * with the log block order.
 * Excludes steps that are already matched.
 */
const findMatchingStepExcluding = (
  steps: NonNullable<WorkflowJobs[0]["steps"]>,
  logBlockStartTime: Date,
  excludeStepNumbers: Set<number>,
  logBlockIndex: number,
  totalCompositeLogBlocks: number,
): { step: NonNullable<WorkflowJobs[0]["steps"]>[0]; index: number } | undefined => {
  // Find all candidate steps within the time tolerance
  const candidates: { step: NonNullable<WorkflowJobs[0]["steps"]>[0]; index: number; diff: number }[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.started_at) continue;
    if (excludeStepNumbers.has(step.number)) continue;

    const stepStart = new Date(step.started_at);
    const diff = Math.abs(logBlockStartTime.getTime() - stepStart.getTime());

    // Allow up to 2 seconds tolerance (log timestamps have millisecond precision,
    // Jobs API timestamps are truncated to seconds)
    if (diff <= 2000) {
      candidates.push({ step, index: i, diff });
    }
  }

  if (candidates.length === 0) return undefined;

  // Sort candidates by:
  // 1. Time difference (closest first)
  // 2. Step index (lower first, to preserve order)
  candidates.sort((a, b) => {
    if (a.diff !== b.diff) return a.diff - b.diff;
    return a.index - b.index;
  });

  // If all candidates have the same time difference (same second),
  // and there are multiple composite log blocks, use the relative position
  const allSameDiff = candidates.every((c) => c.diff === candidates[0].diff);
  if (allSameDiff && candidates.length > 1 && totalCompositeLogBlocks > 1) {
    // Try to pick the candidate at the relative position
    // This helps when multiple composite actions start in the same second
    const relativeIndex = Math.min(logBlockIndex, candidates.length - 1);
    return { step: candidates[relativeIndex].step, index: candidates[relativeIndex].index };
  }

  return { step: candidates[0].step, index: candidates[0].index };
};

/**
 * Find inner steps from log blocks that fall within the parent step's time window.
 * Excludes the composite action's own log block.
 * Uses the next step's start time as end boundary.
 *
 * Note: The completedAt of each inner step is recalculated to be the startedAt
 * of the next inner step (or end of composite), because ##[endgroup] timestamp
 * only marks the end of the group header, not the actual action execution.
 *
 * @param logBlocks - All parsed log blocks
 * @param parentStartedAt - Jobs API step's started_at timestamp
 * @param compositeBlockName - The composite action's log block name (e.g., "./.github/actions/prepare")
 * @param nextStepStartedAt - Jobs API next step's started_at timestamp (for end boundary)
 */
const findInnerStepsFromLogs = (
  logBlocks: LogBlock[],
  parentStartedAt: string | null | undefined,
  compositeBlockName: string,
  nextStepStartedAt: string | null | undefined,
): ParsedLogStep[] => {
  if (!parentStartedAt) return [];

  // Find this specific composite action's log block
  const compositeLogBlock = logBlocks.find((block) =>
    block.name === compositeBlockName
  );
  if (!compositeLogBlock) return [];

  const startTime = compositeLogBlock.startedAt;

  // End boundary: use the next Jobs API step's started_at
  // This is the most reliable way to determine when the composite action ends
  const endTime = nextStepStartedAt
    ? new Date(nextStepStartedAt)
    : new Date("2100-01-01T00:00:00Z");

  const candidateBlocks: LogBlock[] = [];

  for (const block of logBlocks) {
    // Skip if this is any composite action's block (including this one)
    if (block.name.includes(".github/actions")) {
      continue;
    }

    // Check if this block starts after composite log and before next step
    if (block.startedAt > startTime && block.startedAt < endTime) {
      candidateBlocks.push(block);
    }
  }

  // Sort by start time
  candidateBlocks.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  // Recalculate completedAt: use next inner step's startedAt or endTime
  const innerSteps: ParsedLogStep[] = [];
  for (let i = 0; i < candidateBlocks.length; i++) {
    const block = candidateBlocks[i];

    // Next inner step's start time, or end of composite
    const realCompletedAt = i + 1 < candidateBlocks.length
      ? candidateBlocks[i + 1].startedAt
      : endTime;

    innerSteps.push({
      name: block.name,
      startedAt: block.startedAt,
      completedAt: realCompletedAt,
    });
  }

  return innerSteps;
};

/**
 * Create a lookup for composite action inner steps.
 * Key format: "jobId-stepNumber"
 */
export const createCompositeStepLookup = (
  compositeStepsMap: Map<number, CompositeActionStep[]>,
): Map<string, CompositeActionStep> => {
  const lookup = new Map<string, CompositeActionStep>();

  for (const [jobId, compositeSteps] of compositeStepsMap) {
    for (const composite of compositeSteps) {
      const key = `${jobId}-${composite.parentStepNumber}`;
      lookup.set(key, composite);
    }
  }

  return lookup;
};
