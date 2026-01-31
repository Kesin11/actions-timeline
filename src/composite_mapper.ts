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

/**
 * Parse job logs and map composite action inner steps to their parent steps.
 * Uses Jobs API step times to find inner steps within log blocks.
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

    // Find composite steps in this job
    const compositeSteps: CompositeActionStep[] = [];

    for (let stepIdx = 0; stepIdx < job.steps.length; stepIdx++) {
      const step = job.steps[stepIdx];
      if (!isRepoLocalCompositeStep(step.name)) continue;

      // Find the next step's started_at time to use as end boundary
      const nextStep = job.steps[stepIdx + 1];
      const nextStepStartedAt = nextStep?.started_at;

      // Find inner steps from log blocks that fall within this step's time window
      const innerSteps = findInnerStepsFromLogs(
        logBlocks,
        step.started_at,
        step.name,
        nextStepStartedAt,
      );

      if (innerSteps.length > 0) {
        compositeSteps.push({
          parentStepName: step.name,
          parentStepNumber: step.number,
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
 * Find inner steps from log blocks that fall within the parent step's time window.
 * Excludes the composite action's own log block.
 * Uses the next step's start time as end boundary.
 *
 * Note: The completedAt of each inner step is recalculated to be the startedAt
 * of the next inner step (or end of composite), because ##[endgroup] timestamp
 * only marks the end of the group header, not the actual action execution.
 */
const findInnerStepsFromLogs = (
  logBlocks: LogBlock[],
  parentStartedAt: string | null | undefined,
  _parentName: string,
  nextStepStartedAt: string | null | undefined,
): ParsedLogStep[] => {
  if (!parentStartedAt) return [];

  // Find the composite action's log block to get precise start time
  const compositeLogBlock = logBlocks.find((block) =>
    block.name.includes(".github/actions")
  );
  if (!compositeLogBlock) return [];

  const startTime = compositeLogBlock.startedAt;

  // Use next step's log block start time as end boundary if available
  // This is more accurate than Jobs API timestamps
  let endTime: Date;
  if (nextStepStartedAt) {
    // Find a log block that starts after composite and might be the next step.
    // We look for shell/script steps (no "/" in name) that indicate the composite has ended.
    // Action blocks like "denoland/setup-deno@v1" contain "/" and are inner steps.
    // ".github/actions" blocks are composite actions themselves.
    const nextStepLogBlock = logBlocks.find((block) => {
      const isCompositeAction = block.name.includes(".github/actions");
      const isExternalAction = block.name.includes("/"); // e.g., "owner/action@v1"
      const isShellStep = !isCompositeAction && !isExternalAction;
      return block.startedAt > startTime && isShellStep;
    });
    if (nextStepLogBlock) {
      endTime = nextStepLogBlock.startedAt;
    } else {
      endTime = new Date(nextStepStartedAt);
    }
  } else {
    // Last step - use a large future time
    endTime = new Date("2100-01-01T00:00:00Z");
  }

  const candidateBlocks: LogBlock[] = [];

  for (const block of logBlocks) {
    // Skip if this is the composite action's own block
    if (block.name.includes(".github/actions")) {
      continue;
    }

    // Skip if this is a checkout action (not part of composite)
    if (block.name.startsWith("actions/checkout@")) {
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
