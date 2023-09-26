import { format } from "npm:date-fns@2.30.0";
import { Workflow, WorkflowJobs } from "./github.ts";

type ganttJob = {
  section: string;
  steps: ganttStep[];
};

export type ganttStep = {
  name: string;
  id: `job${number}-${number}`;
  status: "" | "done" | "active" | "crit";
  position: string;
  sec: number;
};

// ref: https://docs.github.com/en/rest/actions/workflow-jobs?apiVersion=2022-11-28#get-a-job-for-a-workflow-run
type StepConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

type workflowJobSteps = NonNullable<WorkflowJobs[0]["steps"]>;

const diffSec = (
  start?: string | Date | null,
  end?: string | Date | null,
): number => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);

  return (endDate.getTime() - startDate.getTime()) / 1000;
};

// Sec to elapsed format time like HH:mm:ss (ex. 70sec -> 00:01:10)
const formatElapsedTime = (sec: number): string => {
  const date = new Date(sec * 1000);
  const offsetMinute = date.getTimezoneOffset();
  const timezonreIgnoredDate = new Date(sec * 1000 + offsetMinute * 60 * 1000);
  return format(timezonreIgnoredDate, "HH:mm:ss");
};

// Sec to elapsed short format time like 1h2m3s (ex. 70sec -> 1m10s)
export const formatShortElapsedTime = (sec: number): string => {
  const date = new Date(sec * 1000);
  const offsetMinute = date.getTimezoneOffset();
  const timezonreIgnoredDate = new Date(sec * 1000 + offsetMinute * 60 * 1000);
  if (sec < 60) {
    return format(timezonreIgnoredDate, "s's'");
  } else if (sec < 60 * 60) {
    return format(timezonreIgnoredDate, "m'm's's'");
  } else {
    return format(timezonreIgnoredDate, "H'h'm'm's's'");
  }
};

export const formatStep = (step: ganttStep): string => {
  switch (step.status) {
    case "":
      return `${step.name} :${step.id}, ${step.position}, ${step.sec}s`;
    default:
      return `${step.name} :${step.status}, ${step.id}, ${step.position}, ${step.sec}s`;
  }
};

const formatName = (name: string, sec: number): string => {
  return `${escapeName(name)} (${formatShortElapsedTime(sec)})`;
};

const escapeName = (name: string): string => {
  return name.replaceAll(":", "");
};

const convertStepToStatus = (
  conclusion: StepConclusion,
): ganttStep["status"] => {
  switch (conclusion) {
    case "success":
      return "";
    case "failure":
      return "crit";
    case "cancelled":
    case "skipped":
    case "timed_out":
      return "done";
    case "neutral":
    case "action_required":
    case null:
      return "active";
    default:
      return "active";
  }
};

// Skip steps that is not status:completed (ex. status:queued, status:in_progress)
const filterSteps = (steps: workflowJobSteps): workflowJobSteps => {
  return steps.filter((step) => step.status === "completed");
};

// Skip jobs that is conclusion:skipped
const filterJobs = (jobs: WorkflowJobs): WorkflowJobs => {
  return jobs.filter((job) => job.conclusion !== "skipped");
};

export const createGantt = (
  workflow: Workflow,
  workflowJobs: WorkflowJobs,
): string => {
  const title = workflowJobs[0].workflow_name;
  const jobs = filterJobs(workflowJobs).map(
    (job, jobIndex, _jobs): ganttJob => {
      const section = escapeName(job.name);
      const status: ganttStep["status"] = "active";
      const startJobElapsedSec = diffSec(workflow.created_at, job.created_at);
      const waitingRunnerElapsedSec = diffSec(job.created_at, job.started_at);
      const waitingRunnerStep: ganttStep = {
        name: formatName("Waiting for a runner", waitingRunnerElapsedSec),
        id: `job${jobIndex}-0`,
        status,
        position: formatElapsedTime(startJobElapsedSec),
        sec: waitingRunnerElapsedSec,
      };

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

  return `
\`\`\`mermaid
gantt
title ${title}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
${
    jobs.flatMap((job) => {
      return [
        `section ${job.section}`,
        ...job.steps.map((step) => formatStep(step)),
      ];
    }).join("\n")
  }
\`\`\`
`;
};
