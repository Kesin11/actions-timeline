import { sumOf } from "@std/collections";
import type { WorkflowRun } from "@kesin11/gha-utils";
import {
  convertStepToStatus,
  diffSec,
  escapeName,
  formatElapsedTime,
  formatName,
  formatSection,
} from "./format_util.ts";
import type {
  ganttJob,
  GanttOptions,
  ganttStep,
  StepConclusion,
  TimelineJobs,
  TimelineStep,
} from "./types.ts";

// ref: MAX_TEXTLENGTH https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/mermaidAPI.ts
const MERMAID_MAX_CHAR = 50_000;

type workflowJobSteps = NonNullable<TimelineJobs[0]["steps"]>;

const createGanttStepId = (
  jobIndex: number,
  stepIndex: number,
): ganttStep["id"] => `job${jobIndex}-${stepIndex}`;

// Skip steps that is not status:completed (ex. status:queued, status:in_progress)
const filterSteps = (steps: workflowJobSteps): workflowJobSteps => {
  return steps.filter((step) => step.status === "completed");
};

// Skip jobs that is conclusion:skipped
const filterJobs = (jobs: TimelineJobs): TimelineJobs => {
  return jobs.filter((job) => job.conclusion !== "skipped");
};

const createTopLevelStepPosition = (
  workflow: WorkflowRun,
  jobStartedAt: string,
  previousTopLevelStepId?: ganttStep["id"],
): string => {
  if (previousTopLevelStepId === undefined) {
    return formatElapsedTime(diffSec(workflow.run_started_at, jobStartedAt));
  }

  return `after ${previousTopLevelStepId}`;
};

const createCompositeChildPosition = (
  workflow: WorkflowRun,
  step: TimelineStep,
  compositeChildAnchorId?: ganttStep["id"],
  previousCompositeChildId?: ganttStep["id"],
): string => {
  const anchorId = previousCompositeChildId ?? compositeChildAnchorId;
  if (anchorId === undefined) {
    return formatElapsedTime(diffSec(workflow.run_started_at, step.started_at));
  }

  return `after ${anchorId}`;
};

const createWaitingRunnerStep = (
  workflow: WorkflowRun,
  job: TimelineJobs[0],
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
      id: createGanttStepId(jobIndex, 0),
      status,
      position: formatElapsedTime(startJobElapsedSec),
      sec: waitingRunnerElapsedSec,
    };
  }
};

export const createGanttJobs = (
  workflow: WorkflowRun,
  workflowJobs: TimelineJobs,
  showWaitingRunner = true,
): ganttJob[] => {
  return filterJobs(workflowJobs).map(
    (job, jobIndex, _jobs): ganttJob | undefined => {
      if (job.steps === undefined) return undefined;

      const section = escapeName(job.name);
      const completedSteps = filterSteps(job.steps);
      if (completedSteps.length === 0) return undefined;

      const steps: ganttStep[] = [];
      let previousTopLevelStepId: ganttStep["id"] | undefined;
      let compositeChildAnchorId: ganttStep["id"] | undefined;
      let previousCompositeChildId: ganttStep["id"] | undefined;

      const waitingRunnerStep = createWaitingRunnerStep(
        workflow,
        job,
        jobIndex,
      );
      if (showWaitingRunner && waitingRunnerStep !== undefined) {
        steps.push(waitingRunnerStep);
        previousTopLevelStepId = waitingRunnerStep.id;
      }

      completedSteps.forEach((step, stepIndex) => {
        const stepElapsedSec = diffSec(step.started_at, step.completed_at);
        const id = createGanttStepId(jobIndex, steps.length);
        const nextStep = completedSteps[stepIndex + 1];
        const position = step.timelineRowKind === "composite-child"
          ? createCompositeChildPosition(
            workflow,
            step,
            compositeChildAnchorId,
            previousCompositeChildId,
          )
          : createTopLevelStepPosition(
            workflow,
            job.started_at,
            previousTopLevelStepId,
          );

        steps.push({
          name: formatName(step.name, stepElapsedSec),
          id,
          status: convertStepToStatus(step.conclusion as StepConclusion),
          position,
          sec: stepElapsedSec,
        });

        if (step.timelineRowKind === "composite-child") {
          previousCompositeChildId = id;
          return;
        }

        compositeChildAnchorId = nextStep?.timelineRowKind === "composite-child"
          ? previousTopLevelStepId
          : undefined;
        previousCompositeChildId = undefined;
        previousTopLevelStepId = id;
      });

      return { section, steps };
    },
  ).filter((gantJobs): gantJobs is ganttJob => gantJobs !== undefined);
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
  workflowJobs: TimelineJobs,
  options: GanttOptions,
): string => {
  const title = workflow.name ?? "";
  const jobs = createGanttJobs(
    workflow,
    workflowJobs,
    options.showWaitingRunner,
  );
  return createGanttDiagrams(title, jobs).join("\n");
};
