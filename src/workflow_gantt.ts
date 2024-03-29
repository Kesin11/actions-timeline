import { sumOf } from "https://deno.land/std@0.221.0/collections/mod.ts";
import { Workflow, WorkflowJobs } from "./github.ts";
import {
  convertStepToStatus,
  diffSec,
  escapeName,
  formatElapsedTime,
  formatName,
  formatSection,
} from "./format_util.ts";
import type { ganttJob, ganttStep, StepConclusion } from "./types.ts";

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
  workflow: Workflow,
  job: WorkflowJobs[0],
  jobIndex: number,
): ganttStep => {
  const status: ganttStep["status"] = "active";

  // job.created_at does not exist in < GHES v3.9.
  // So it is not possible to calculate the elapsed time the runner is waiting for a job, is not supported instead of the elapsed time.
  // Also, it is not possible to create an exact job start time position. So use job.started_at instead of job.created_at.
  if (job.created_at === undefined) {
    const startJobElapsedSec = diffSec(
      workflow.run_started_at,
      job.started_at,
    );
    // dummy sec for gantt look and feel
    const waitingRunnerElapsedSec = startJobElapsedSec;
    return {
      name: `Waiting for a runner (not supported < GHES v3.9)`,
      id: `job${jobIndex}-0`,
      status,
      // dummy position for gantt look and feel
      position: formatElapsedTime(0),
      sec: waitingRunnerElapsedSec,
    };
    // >= GHES v3.9 or GitHub.com
  } else {
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
  workflow: Workflow,
  workflowJobs: WorkflowJobs,
): ganttJob[] => {
  return filterJobs(workflowJobs).map(
    (job, jobIndex, _jobs): ganttJob => {
      const section = escapeName(job.name);
      const waitingRunnerStep = createWaitingRunnerStep(
        workflow,
        job,
        jobIndex,
      );

      const steps = filterSteps(job.steps ?? []).map(
        (step, stepIndex, _steps): ganttStep => {
          const stepElapsedSec = diffSec(step.started_at, step.completed_at);
          return {
            name: formatName(step.name, stepElapsedSec),
            id: `job${jobIndex}-${stepIndex + 1}`,
            status: convertStepToStatus(step.conclusion as StepConclusion),
            position: `after job${jobIndex}-${stepIndex}`,
            sec: stepElapsedSec,
          };
        },
      );

      return { section, steps: [waitingRunnerStep, ...steps] };
    },
  );
};

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

  // Split mermaid body by maxChar
  const mermaids = [];
  let sections: string[] = [];
  for (const job of ganttJobs) {
    const newSection = formatSection(job);

    const sectionsSumLength = sumOf(sections, (section) => section.length);
    if (headerFooterLength + sectionsSumLength + newSection.length > maxChar) {
      mermaids.push(header + sections.join("\n") + footer);
      sections = [newSection];
    } else {
      sections.push(newSection);
    }
  }
  mermaids.push(header + sections.join("\n") + footer);

  return mermaids;
};

export const createMermaid = (
  workflow: Workflow,
  workflowJobs: WorkflowJobs,
): string => {
  const title = workflow.name ?? "";
  const jobs = createGanttJobs(workflow, workflowJobs);
  return createGanttDiagrams(title, jobs).join("\n");
};
