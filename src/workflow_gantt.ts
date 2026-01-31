import { sumOf } from "@std/collections";
import type { WorkflowJobs, WorkflowRun } from "@kesin11/gha-utils";
import {
  convertStepToStatus,
  diffSec,
  escapeName,
  formatElapsedTime,
  formatName,
  formatSection,
} from "./format_util.ts";
import type {
  CompositeActionStep,
  ganttJob,
  GanttOptions,
  ganttStep,
  JobLogs,
  StepConclusion,
} from "./types.ts";
import {
  createCompositeStepLookup,
  parseCompositeActionsFromLogs,
} from "./composite_mapper.ts";

// ref: MAX_TEXTLENGTH https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/mermaidAPI.ts
const MERMAID_MAX_CHAR = 50_000;

type workflowJobSteps = NonNullable<WorkflowJobs[0]["steps"]>;

// Skip steps that is not status:completed (ex. status:queued, status:in_progress)
const filterSteps = (steps: workflowJobSteps): workflowJobSteps => {
  return steps.filter((step) => step.status === "completed");
};

// Skip jobs that is conclusion:skipped
const filterJobs = (jobs: WorkflowJobs): WorkflowJobs => {
  return jobs.filter((job) => job.conclusion !== "skipped");
};

const createWaitingRunnerStep = (
  workflow: WorkflowRun,
  job: WorkflowJobs[0],
  jobIndex: number,
): ganttStep | undefined => {
  const status: ganttStep["status"] = "active";

  // job.created_at does not exist in < GHES v3.9.
  // So it is not possible to calculate the elapsed time the runner is waiting for a job, is not supported instead of the elapsed time.
  // Also, it is not possible to create an exact job start time position. So use job.started_at instead of job.created_at.
  if (job.created_at === undefined) {
    return undefined;
  } else {
    // >= GHES v3.9 or GitHub.com
    const startJobElapsedSec = diffSec(
      workflow.run_started_at,
      job.created_at,
    );
    const waitingRunnerElapsedSec = diffSec(job.created_at, job.started_at);
    return {
      name: formatName("Waiting for a runner", waitingRunnerElapsedSec),
      id: `job${jobIndex}-0`,
      status,
      position: formatElapsedTime(startJobElapsedSec),
      sec: waitingRunnerElapsedSec,
    };
  }
};

export const createGanttJobs = (
  workflow: WorkflowRun,
  workflowJobs: WorkflowJobs,
  showWaitingRunner = true,
  compositeStepLookup?: Map<string, CompositeActionStep>,
): ganttJob[] => {
  return filterJobs(workflowJobs).map(
    (job, jobIndex, _jobs): ganttJob | undefined => {
      if (job.steps === undefined) return undefined;

      const section = escapeName(job.name);
      let firstStep: ganttStep;

      const waitingRunnerStep = createWaitingRunnerStep(
        workflow,
        job,
        jobIndex,
      );
      if (!showWaitingRunner || waitingRunnerStep === undefined) {
        const rawFirstStep = job.steps.shift();
        if (rawFirstStep === undefined) return undefined;

        const startJobElapsedSec = diffSec(
          workflow.run_started_at,
          job.started_at,
        );
        const stepElapsedSec = diffSec(
          rawFirstStep.started_at,
          rawFirstStep.completed_at,
        );
        firstStep = {
          name: formatName(rawFirstStep.name, stepElapsedSec),
          id: `job${jobIndex}-0`,
          status: convertStepToStatus(
            rawFirstStep.conclusion as StepConclusion,
          ),
          position: formatElapsedTime(startJobElapsedSec),
          sec: stepElapsedSec,
        };
      } else {
        firstStep = waitingRunnerStep;
      }

      const filteredSteps = filterSteps(job.steps);
      const steps: ganttStep[] = [];
      let currentStepIndex = 0; // Track position for "after" references

      for (let i = 0; i < filteredSteps.length; i++) {
        const step = filteredSteps[i];
        const stepElapsedSec = diffSec(step.started_at, step.completed_at);
        const stepId: ganttStep["id"] = `job${jobIndex}-${
          currentStepIndex + 1
        }`;

        // Check if this step is a composite action with decomposed substeps
        if (compositeStepLookup) {
          const compositeKey = `${job.id}-${step.number}`;
          const composite = compositeStepLookup.get(compositeKey);
          if (composite && composite.innerSteps.length > 0) {
            // Replace the composite step with its inner steps
            const innerGanttSteps = createCompositeInnerSteps(
              composite,
              jobIndex,
              currentStepIndex,
              workflow.run_started_at,
            );
            steps.push(...innerGanttSteps);
            currentStepIndex += innerGanttSteps.length;
            continue; // Skip adding the parent composite step
          }
        }

        // Regular step (not a composite or no substeps found)
        const roundedSec = Math.floor(stepElapsedSec);
        const baseStep: ganttStep = {
          name: formatName(step.name, roundedSec),
          id: stepId,
          status: convertStepToStatus(step.conclusion as StepConclusion),
          position: `after job${jobIndex}-${currentStepIndex}`,
          sec: roundedSec,
        };
        steps.push(baseStep);
        currentStepIndex++;
      }

      return { section, steps: [firstStep, ...steps] };
    },
  ).filter((gantJobs): gantJobs is ganttJob => gantJobs !== undefined);
};

/**
 * Create regular steps from composite action's inner steps.
 * These replace the composite action step in the timeline.
 *
 * Note: Inner step status is always shown as success (empty string) because
 * GitHub's job logs don't include failure status information for individual
 * steps within composite actions. If the composite action failed, the parent
 * step's failure would be visible in the original timeline.
 */
const createCompositeInnerSteps = (
  composite: CompositeActionStep,
  jobIndex: number,
  previousStepIndex: number,
  _workflowStartedAt: string | null | undefined,
): ganttStep[] => {
  return composite.innerSteps.map((innerStep, innerIndex): ganttStep => {
    const stepElapsedSec = Math.floor(
      diffSec(innerStep.startedAt, innerStep.completedAt),
    );

    // Calculate position
    // First inner step: after the previous step in the job
    // Subsequent inner steps: after the previous inner step
    const stepIndex = previousStepIndex + 1 + innerIndex;
    const position = `after job${jobIndex}-${stepIndex - 1}`;

    return {
      name: formatName(innerStep.name, stepElapsedSec),
      id: `job${jobIndex}-${stepIndex}`,
      status: "", // Success status for parsed steps
      position: position,
      sec: stepElapsedSec,
    };
  });
};

/**
 * Creates Mermaid gantt diagrams from workflow jobs data.
 *
 * This function generates one or more Mermaid gantt chart strings, automatically
 * splitting them into multiple diagrams if the content exceeds the maxChar limit.
 * This prevents "Maximum text size in diagram exceeded" errors in Mermaid.js.
 *
 * @param title - The title to display in the gantt chart
 * @param ganttJobs - Array of processed job data containing sections and steps
 * @param maxChar - Maximum character limit per diagram (default: 50,000)
 * @returns Array of complete Mermaid diagram strings (markdown code blocks)
 */
export const createGanttDiagrams = (
  title: string,
  ganttJobs: ganttJob[],
  maxChar: number = MERMAID_MAX_CHAR, // For test argument
): string[] => {
  const header = `
\`\`\`mermaid
gantt
title ${escapeName(title)}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
`;
  const footer = "\n\`\`\`";
  const headerFooterLength = header.length + footer.length;

  // Split mermaid body by maxChar to avoid exceeding Mermaid.js text size limit
  const mermaids = [];
  let sections: string[] = [];
  for (const job of ganttJobs) {
    const newSection = formatSection(job);

    // Calculate total length of existing sections including newlines between them
    // sections.join("\n") adds (sections.length - 1) newline characters
    // This fix addresses issue #222 where newlines were not counted in the original calculation
    const sectionsSumLength = sumOf(sections, (section) => section.length) +
      Math.max(0, sections.length - 1);

    // Check if adding the new section would exceed maxChar limit
    if (headerFooterLength + sectionsSumLength + newSection.length > maxChar) {
      // Exceeds limit: finalize current diagram and start a new one
      mermaids.push(header + sections.join("\n") + footer);
      sections = [newSection];
    } else {
      // Within limit: add section to current diagram
      sections.push(newSection);
    }
  }
  // Add the final diagram
  mermaids.push(header + sections.join("\n") + footer);

  return mermaids;
};

export const createMermaid = (
  workflow: WorkflowRun,
  workflowJobs: WorkflowJobs,
  options: GanttOptions,
  jobLogs?: JobLogs,
): string => {
  const title = workflow.name ?? "";

  // Create composite step lookup if enabled and logs are provided
  let compositeStepLookup: Map<string, CompositeActionStep> | undefined;
  if (options.showCompositeActions && jobLogs && jobLogs.size > 0) {
    const compositeStepsMap = parseCompositeActionsFromLogs(
      workflowJobs,
      jobLogs,
    );
    compositeStepLookup = createCompositeStepLookup(compositeStepsMap);
  }

  const jobs = createGanttJobs(
    workflow,
    workflowJobs,
    options.showWaitingRunner,
    compositeStepLookup,
  );
  return createGanttDiagrams(title, jobs).join("\n");
};
