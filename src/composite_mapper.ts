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
 * Check if a log block name represents an action invocation.
 * Action invocations have a "/" in the name (e.g., "actions/checkout@v4", "owner/action@version").
 * This filters out:
 * - Shell commands (e.g., "Run npm install", "Run echo ...")
 * - User-defined groups (e.g., "Build", "Unit Tests")
 * - Variable expansion commands (e.g., "${GITHUB_ACTION_PATH}/scripts/...")
 */
const isActionInvocationBlock = (blockName: string): boolean => {
  // Action names follow the pattern: owner/repo@version or owner/repo@sha
  // Examples: "actions/checkout@v4", "denoland/setup-deno@v1"
  // Exclude blocks starting with "Run " as these are shell commands
  if (blockName.startsWith("Run ")) {
    return false;
  }
  // Exclude variable expansion patterns
  if (blockName.includes("${")) {
    return false;
  }
  // Must contain "/" to be an action reference
  return blockName.includes("/");
};

/**
 * Filter out nested composite action log blocks.
 * A nested composite action is one that starts within the time range of another
 * composite action. Only top-level (directly called from workflow) composite
 * actions should be matched with Jobs API steps.
 *
 * @param compositeBlocks - Array of composite action log blocks, sorted by start time
 * @returns Array of top-level composite action log blocks only
 */
export const filterNestedCompositeBlocks = (
  compositeBlocks: LogBlock[],
): LogBlock[] => {
  if (compositeBlocks.length <= 1) return compositeBlocks;

  const topLevelBlocks: LogBlock[] = [];
  let currentParentEnd: Date | null = null;

  for (const block of compositeBlocks) {
    // If we're within a parent composite's time range, this is a nested composite
    if (currentParentEnd !== null && block.startedAt < currentParentEnd) {
      // Skip this nested composite action
      continue;
    }

    // This is a top-level composite action
    topLevelBlocks.push(block);
    // Update the parent end time
    currentParentEnd = block.completedAt;
  }

  return topLevelBlocks;
};

/**
 * Filter composite log blocks to only those that correspond to Jobs API steps.
 * A composite log block is considered top-level (not nested) if its start time
 * is within 2 seconds of any Jobs API step's start time.
 *
 * This approach works because:
 * - Top-level composite actions correspond to Jobs API steps
 * - Nested composite actions (called from within another composite) don't have
 *   their own Jobs API step entry
 *
 * @param compositeBlocks - Array of composite action log blocks
 * @param steps - Jobs API steps for the job
 * @returns Array of composite log blocks that match Jobs API steps
 */
const filterCompositeBlocksByJobsApiSteps = (
  compositeBlocks: LogBlock[],
  steps: NonNullable<WorkflowJobs[0]["steps"]>,
): LogBlock[] => {
  const stepStartTimes = steps
    .filter((s) => s.started_at)
    .map((s) => new Date(s.started_at!).getTime());

  return compositeBlocks.filter((block) => {
    const blockTime = block.startedAt.getTime();
    // Check if any Jobs API step started within 2 seconds of this block
    return stepStartTimes.some((stepTime) =>
      Math.abs(blockTime - stepTime) <= 2000
    );
  });
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
    const allCompositeLogBlocks = sortedBlocks.filter((block) =>
      isCompositeLogBlock(block.name)
    );

    // Filter to only top-level composites that match Jobs API steps
    // A composite log block is top-level if its start time is within 2 seconds
    // of a Jobs API step's start time
    const compositeLogBlocks = filterCompositeBlocksByJobsApiSteps(
      allCompositeLogBlocks,
      job.steps,
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
        block.name,
        matchedStepNumbers,
        blockIdx,
        compositeLogBlocks.length,
      );
      if (!match) continue;

      const { step: parentStep, index: stepIdx } = match;
      matchedStepNumbers.add(parentStep.number);

      // Find the next step's started_at time to use as end boundary
      const nextStep = job.steps[stepIdx + 1];
      let nextStepStartedAt = nextStep?.started_at;

      // If next step starts at the same second (or earlier due to timestamp truncation),
      // use the next composite log block's start time as end boundary instead
      if (nextStepStartedAt) {
        const compositeBlockTime = block.startedAt.getTime();
        const nextStepTime = new Date(nextStepStartedAt).getTime();
        if (nextStepTime <= compositeBlockTime) {
          // Use next composite log block's start time, or undefined if this is the last one
          const nextCompositeBlock = compositeLogBlocks[blockIdx + 1];
          nextStepStartedAt = nextCompositeBlock?.startedAt.toISOString();
        }
      }

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
 * When multiple steps have the same second, uses additional heuristics:
 * 1. Prefer steps whose name matches the composite action pattern
 * 2. Use step order to match with log block order
 * Excludes steps that are already matched.
 */
const findMatchingStepExcluding = (
  steps: NonNullable<WorkflowJobs[0]["steps"]>,
  logBlockStartTime: Date,
  logBlockName: string,
  excludeStepNumbers: Set<number>,
  logBlockIndex: number,
  totalCompositeLogBlocks: number,
):
  | { step: NonNullable<WorkflowJobs[0]["steps"]>[0]; index: number }
  | undefined => {
  // Find all candidate steps within the time tolerance
  const candidates: {
    step: NonNullable<WorkflowJobs[0]["steps"]>[0];
    index: number;
    diff: number;
    isCompositeByName: boolean;
  }[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.started_at) continue;
    if (excludeStepNumbers.has(step.number)) continue;

    const stepStart = new Date(step.started_at);
    const diff = Math.abs(logBlockStartTime.getTime() - stepStart.getTime());

    // Allow up to 2 seconds tolerance (log timestamps have millisecond precision,
    // Jobs API timestamps are truncated to seconds)
    if (diff <= 2000) {
      candidates.push({
        step,
        index: i,
        diff,
        isCompositeByName: isRepoLocalCompositeStep(step.name),
      });
    }
  }

  if (candidates.length === 0) return undefined;

  // Sort candidates by:
  // 1. Steps with composite action name pattern first (isCompositeByName)
  // 2. Time difference (closest first)
  // 3. Step index (lower first, to preserve order)
  candidates.sort((a, b) => {
    // Prefer steps that match the composite action name pattern
    if (a.isCompositeByName !== b.isCompositeByName) {
      return a.isCompositeByName ? -1 : 1;
    }
    if (a.diff !== b.diff) return a.diff - b.diff;
    return a.index - b.index;
  });

  // If the best candidate has a composite name pattern, use it directly
  if (candidates[0].isCompositeByName) {
    return { step: candidates[0].step, index: candidates[0].index };
  }

  // No candidate has composite name pattern - this means the step has a custom name
  // (e.g., "Run Tests" instead of "Run ./.github/actions/run-tests")
  // Use heuristics to find the best match

  // If all candidates have the same time difference (same second),
  // and there are multiple composite log blocks, use the relative position
  const allSameDiff = candidates.every((c) => c.diff === candidates[0].diff);
  if (allSameDiff && candidates.length > 1 && totalCompositeLogBlocks > 1) {
    // Extract action name from log block for better matching
    // e.g., "./.github/actions/run-tests" -> "run-tests"
    const actionName = extractActionNameFromLogBlock(logBlockName);

    // Try to find a candidate whose name resembles the action name
    const matchingCandidate = candidates.find((c) =>
      stepNameMatchesActionName(c.step.name, actionName)
    );
    if (matchingCandidate) {
      return { step: matchingCandidate.step, index: matchingCandidate.index };
    }

    // Fallback: use relative position
    const relativeIndex = Math.min(logBlockIndex, candidates.length - 1);
    return {
      step: candidates[relativeIndex].step,
      index: candidates[relativeIndex].index,
    };
  }

  return { step: candidates[0].step, index: candidates[0].index };
};

/**
 * Extract the action name from a log block name.
 * e.g., "./.github/actions/run-tests" -> "run-tests"
 */
const extractActionNameFromLogBlock = (logBlockName: string): string => {
  const match = logBlockName.match(/^\.\/\.github\/actions\/(.+)$/);
  return match ? match[1] : logBlockName;
};

/**
 * Check if a step name resembles an action name.
 * Handles transformations like "run-tests" -> "Run Tests"
 * or "calculate-vars" -> "Calculate Release Variables"
 */
const stepNameMatchesActionName = (
  stepName: string,
  actionName: string,
): boolean => {
  // Normalize for comparison: lowercase, remove hyphens/spaces/underscores
  const normalizeForComparison = (s: string) =>
    s.toLowerCase().replace(/[-_\s]/g, "");

  const normalizedStep = normalizeForComparison(stepName);
  const normalizedAction = normalizeForComparison(actionName);

  // Check if step contains the full action name (simple case)
  if (normalizedStep.includes(normalizedAction)) {
    return true;
  }

  // Split both names into words and compare using prefix matching
  // e.g., "calculate-vars" -> ["calculate", "vars"]
  // "Calculate Release Variables" -> ["calculate", "release", "variables"]
  // Compare first 3 chars: "cal" == "cal", "var" == "var" -> matches
  const actionWords = actionName.toLowerCase().split(/[-_]/);
  const stepWords = stepName.toLowerCase().split(/[-_\s]+/);

  // Prefix length for fuzzy matching (handles abbreviations like "vars" -> "variables")
  const prefixLen = 3;

  // Each action word's prefix must match some step word's prefix
  const allWordsMatch = actionWords.every((actionWord) => {
    const actionPrefix = actionWord.slice(0, prefixLen);
    return stepWords.some((stepWord) =>
      stepWord.slice(0, prefixLen) === actionPrefix
    );
  });

  return allWordsMatch;
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

    // Only include action invocations (blocks with "/" in the name)
    // This filters out:
    // - Shell commands like "Run echo ..." or "npm run ..."
    // - User-defined groups like "Build", "Unit Tests"
    // Examples of valid action names:
    // - "actions/checkout@v4"
    // - "denoland/setup-deno@v1"
    // - "nick-fields/retry@..."
    if (!isActionInvocationBlock(block.name)) {
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
