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
 * Inner steps are blocks that fall within the composite's time window.
 */
export const findCompositeActionBlocks = (
  logBlocks: LogBlock[],
): CompositeActionStep[] => {
  const compositeSteps: CompositeActionStep[] = [];

  // First, identify all composite action blocks
  const compositeBlocks = logBlocks.filter((block) =>
    REPO_LOCAL_COMPOSITE_LOG_PATTERN.test(`##[group]Run ${block.name}`)
  );

  for (const compositeBlock of compositeBlocks) {
    const innerSteps: ParsedLogStep[] = [];

    // Find all blocks that fall within this composite's time window
    // and are NOT themselves composite actions
    for (const block of logBlocks) {
      // Skip if this is a composite action itself
      if (REPO_LOCAL_COMPOSITE_LOG_PATTERN.test(`##[group]Run ${block.name}`)) {
        continue;
      }

      // Check if this block falls within the composite's time window
      if (
        block.startedAt >= compositeBlock.startedAt &&
        block.completedAt <= compositeBlock.completedAt
      ) {
        innerSteps.push({
          name: block.name,
          startedAt: block.startedAt,
          completedAt: block.completedAt,
        });
      }
    }

    if (innerSteps.length > 0) {
      // Sort inner steps by start time
      innerSteps.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

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
