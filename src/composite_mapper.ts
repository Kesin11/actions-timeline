import type { WorkflowJobs } from "@kesin11/gha-utils";
import { parseJobLogsForCompositeSteps } from "./log_parser.ts";
import type { CompositeActionStep, JobLogs } from "./types.ts";

// Pattern to detect repo-local composite action usage in step name
// e.g., "Run ./.github/actions/setup-deno-with-cache"
const REPO_LOCAL_COMPOSITE_PATTERN = /^Run \.\/\.github\/actions\//;

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

    // Parse composite steps from logs
    const compositeSteps = parseJobLogsForCompositeSteps(logText);

    // Match parsed steps to job steps
    const matchedSteps = matchCompositeStepsToJobSteps(
      job.steps,
      compositeSteps,
    );

    if (matchedSteps.length > 0) {
      result.set(job.id, matchedSteps);
    }
  }

  return result;
};

/**
 * Match parsed composite steps from logs to actual job steps.
 * This assigns the correct step number to each composite action.
 */
const matchCompositeStepsToJobSteps = (
  jobSteps: NonNullable<WorkflowJobs[0]["steps"]>,
  parsedCompositeSteps: CompositeActionStep[],
): CompositeActionStep[] => {
  const matched: CompositeActionStep[] = [];

  for (const composite of parsedCompositeSteps) {
    // Find the matching job step by comparing names
    // The log shows "Run ./.github/actions/..." which should match step.name
    const matchingStep = jobSteps.find((step) => {
      // Step name in Jobs API is like "./.github/actions/setup-deno-with-cache"
      // Log shows "Run ./.github/actions/setup-deno-with-cache"
      // So we need to match "Run " + step name or just compare the path part
      const stepPath = step.name;
      const logPath = composite.parentStepName;

      // Direct comparison - log name should be exactly step.name
      // or log name could be step.name with "Run " prefix
      return stepPath === logPath || `Run ${stepPath}` === `Run ${logPath}`;
    });

    if (matchingStep) {
      matched.push({
        ...composite,
        parentStepNumber: matchingStep.number,
        parentStepName: matchingStep.name,
      });
    }
  }

  return matched;
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
