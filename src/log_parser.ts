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
 */
export const parseLogBlocks = (logText: string): LogBlock[] => {
  const lines = logText.split("\n");
  const blocks: LogBlock[] = [];
  let currentBlock: { name: string; startedAt: Date } | undefined;

  for (const line of lines) {
    const timestamp = parseTimestamp(line);

    // Check for group start
    const groupStartMatch = line.match(GROUP_START_PATTERN);
    if (groupStartMatch && timestamp) {
      currentBlock = {
        name: groupStartMatch[1].trim(),
        startedAt: timestamp,
      };
      continue;
    }

    // Check for group end
    if (GROUP_END_PATTERN.test(line) && currentBlock && timestamp) {
      blocks.push({
        name: currentBlock.name,
        startedAt: currentBlock.startedAt,
        completedAt: timestamp,
      });
      currentBlock = undefined;
      continue;
    }
  }

  return blocks;
};

/**
 * Find the composite action block and its inner steps from log blocks.
 * A composite action block is detected by "Run ./.github/actions/..." pattern.
 * Inner steps are the subsequent group blocks within the composite's time window.
 */
export const findCompositeActionBlocks = (
  logBlocks: LogBlock[],
): CompositeActionStep[] => {
  const compositeSteps: CompositeActionStep[] = [];

  for (let i = 0; i < logBlocks.length; i++) {
    const block = logBlocks[i];

    // Check if this is a repo-local composite action
    if (REPO_LOCAL_COMPOSITE_LOG_PATTERN.test(`##[group]Run ${block.name}`)) {
      const innerSteps: ParsedLogStep[] = [];
      const compositeEndTime = block.completedAt;

      // Look for inner steps that start after this composite starts
      // and complete before or at the composite's end time
      for (let j = i + 1; j < logBlocks.length; j++) {
        const innerBlock = logBlocks[j];

        // Skip if this block is another composite action
        if (
          REPO_LOCAL_COMPOSITE_LOG_PATTERN.test(
            `##[group]Run ${innerBlock.name}`,
          )
        ) {
          break;
        }

        // Check if this block falls within the composite's time window
        if (innerBlock.startedAt >= block.startedAt &&
            innerBlock.completedAt <= compositeEndTime) {
          innerSteps.push({
            name: innerBlock.name,
            startedAt: innerBlock.startedAt,
            completedAt: innerBlock.completedAt,
          });
        } else if (innerBlock.startedAt > compositeEndTime) {
          // Past the composite's time window, stop looking
          break;
        }
      }

      if (innerSteps.length > 0) {
        // Extract step number from block name (if present)
        // The step number is not in the log, so we'll use -1 as placeholder
        // The actual step number will be matched later
        compositeSteps.push({
          parentStepName: block.name,
          parentStepNumber: -1,
          innerSteps,
        });
      }
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
