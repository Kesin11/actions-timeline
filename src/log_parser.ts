import type { CompositeActionStep, ParsedLogStep } from "./types.ts";

// Pattern to match timestamp prefix in log lines
// Format: YYYY-MM-DDTHH:MM:SS.fractionZ
const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;

// Pattern to match group start: "##[group]Run ..."
const GROUP_START_PATTERN = /##\[group\]Run\s+(.+)/;

// Pattern to match group end: "##[endgroup]"
const GROUP_END_PATTERN = /##\[endgroup\]/;

// Pattern to detect repo-local composite action in log
const REPO_LOCAL_COMPOSITE_LOG_PATTERN =
  /^##\[group\]Run \.\/\.github\/actions\/(.+)/;

/**
 * Parse a timestamp from a log line.
 * Returns the Date object or undefined if not found.
 */
export const parseTimestamp = (line: string): Date | undefined => {
  const match = line.match(TIMESTAMP_PATTERN);
  if (match) {
    return new Date(match[1]);
  }
  return undefined;
};

/**
 * Represents a parsed log block with start and end times.
 */
export type LogBlock = {
  name: string;
  startedAt: Date;
  completedAt: Date;
};

/**
 * Parse all group blocks from job log text.
 * Returns an array of LogBlock objects.
 * Note: This handles nested groups by tracking nesting depth.
 */
export const parseLogBlocks = (logText: string): LogBlock[] => {
  const lines = logText.split("\n");
  const blocks: LogBlock[] = [];
  const blockStack: { name: string; startedAt: Date }[] = [];

  for (const line of lines) {
    const timestamp = parseTimestamp(line);

    // Check for group start
    const groupStartMatch = line.match(GROUP_START_PATTERN);
    if (groupStartMatch && timestamp) {
      blockStack.push({
        name: groupStartMatch[1].trim(),
        startedAt: timestamp,
      });
      continue;
    }

    // Check for group end
    if (GROUP_END_PATTERN.test(line) && blockStack.length > 0 && timestamp) {
      const completedBlock = blockStack.pop()!;
      blocks.push({
        name: completedBlock.name,
        startedAt: completedBlock.startedAt,
        completedAt: timestamp,
      });
      continue;
    }
  }

  return blocks;
};

/**
 * Find the composite action block and its inner steps from log blocks.
 * A composite action block is detected by "Run ./.github/actions/..." pattern.
 * Inner steps are blocks that start immediately after the composite block
 * and are action-like (contain "/").
 *
 * Note: The completedAt of each inner step is recalculated to be the startedAt
 * of the next step, because ##[endgroup] timestamp only marks the end of the
 * group header, not the actual action execution.
 */
export const findCompositeActionBlocks = (
  logBlocks: LogBlock[],
): CompositeActionStep[] => {
  const compositeSteps: CompositeActionStep[] = [];

  // Sort blocks by start time
  const sortedBlocks = [...logBlocks].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );

  for (let i = 0; i < sortedBlocks.length; i++) {
    const block = sortedBlocks[i];

    // Check if this is a composite action
    if (!REPO_LOCAL_COMPOSITE_LOG_PATTERN.test(`##[group]Run ${block.name}`)) {
      continue;
    }

    const compositeBlock = block;
    const candidateBlocks: LogBlock[] = [];

    // Look at blocks after this composite
    for (let j = i + 1; j < sortedBlocks.length; j++) {
      const nextBlock = sortedBlocks[j];

      // Stop if we hit another composite action
      if (
        REPO_LOCAL_COMPOSITE_LOG_PATTERN.test(`##[group]Run ${nextBlock.name}`)
      ) {
        break;
      }

      // Stop if we hit a non-action step (doesn't contain "/" or is a shell command)
      const isActionLike = nextBlock.name.includes("/") &&
        !nextBlock.name.includes(".github/actions");
      if (!isActionLike) {
        break;
      }

      candidateBlocks.push(nextBlock);
    }

    if (candidateBlocks.length > 0) {
      // Recalculate completedAt: use next step's startedAt
      const innerSteps: ParsedLogStep[] = [];
      for (let k = 0; k < candidateBlocks.length; k++) {
        const candidateBlock = candidateBlocks[k];

        // Next inner step's start time
        const nextInnerBlockStartedAt = k + 1 < candidateBlocks.length
          ? candidateBlocks[k + 1].startedAt
          : undefined;

        // For last inner step, find the next block in overall sorted list
        let realCompletedAt = candidateBlock.completedAt;
        if (nextInnerBlockStartedAt) {
          realCompletedAt = nextInnerBlockStartedAt;
        } else {
          // Find index of this candidate in sorted blocks
          const candidateIdx = sortedBlocks.indexOf(candidateBlock);
          if (candidateIdx >= 0 && candidateIdx + 1 < sortedBlocks.length) {
            realCompletedAt = sortedBlocks[candidateIdx + 1].startedAt;
          }
        }

        innerSteps.push({
          name: candidateBlock.name,
          startedAt: candidateBlock.startedAt,
          completedAt: realCompletedAt,
        });
      }

      compositeSteps.push({
        parentStepName: compositeBlock.name,
        parentStepNumber: -1,
        innerSteps,
      });
    }
  }

  return compositeSteps;
};

/**
 * Parse job logs and extract composite action steps.
 * This is the main entry point for log parsing.
 */
export const parseJobLogsForCompositeSteps = (
  logText: string,
): CompositeActionStep[] => {
  const logBlocks = parseLogBlocks(logText);
  return findCompositeActionBlocks(logBlocks);
};
