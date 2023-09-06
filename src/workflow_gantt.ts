import { format } from "npm:date-fns@2.30.0";
import { Workflow, WorkflowJobs } from "./github.ts";

// ref: https://docs.github.com/ja/free-pro-team@latest/rest/actions/workflow-jobs?apiVersion=2022-11-28#get-a-job-for-a-workflow-run
type StepConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required";

const diffSec = (start: string | Date, end: string | Date): number => {
  const startDate = new Date(start);
  const endDate = new Date(end);

  return (endDate.getTime() - startDate.getTime()) / 1000;
};

// Sec to elapsed time that format is HH:mm:ss (eg. 70sec -> 00:01:10)
const formatElapsedTime = (sec: number): string => {
  const date = new Date(sec * 1000);
  const offsetMinute = date.getTimezoneOffset();
  const timezonreIgnoredDate = new Date(sec * 1000 + offsetMinute * 60 * 1000);
  return format(timezonreIgnoredDate, "HH:mm:ss");
};

export const formatStep = (step: ganttStep): string => {
  switch (step.status) {
    case "":
      return `${step.name} :${step.id}, ${step.position}, ${step.sec}s`;
    default:
      return `${step.name} :${step.status}, ${step.id}, ${step.position}, ${step.sec}s`;
  }
};

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

const stepStatusMap: Record<StepConclusion, ganttStep["status"]> = {
  success: "",
  failure: "crit",
  cancelled: "done",
  skipped: "done",
  timed_out: "done",
  neutral: "active",
  action_required: "active",
} as const;

export const createGantt = (
  workflow: Workflow,
  workflowJobs: WorkflowJobs,
): string => {
  const title = workflowJobs[0].workflow_name;
  const jobs = workflowJobs.map((job, jobIndex, _jobs): ganttJob => {
    const section = job.name;
    const status: ganttStep["status"] = "active";
    const startJobElapsedSec = diffSec(workflow.created_at, job.created_at);
    const waitingRunnerStep: ganttStep = {
      name: "Waiting for a runner",
      id: `job${jobIndex}-0`,
      status,
      position: formatElapsedTime(startJobElapsedSec),
      sec: diffSec(job.created_at, job.started_at),
    };

    const steps = job.steps?.map((step, stepIndex, _steps): ganttStep => {
      return {
        name: step.name,
        id: `job${jobIndex}-${stepIndex + 1}`,
        status: stepStatusMap[step.conclusion as StepConclusion] ?? "active",
        position: `after job${jobIndex}-${stepIndex}`,
        sec: diffSec(step.started_at!, step.completed_at!),
      };
    }) ?? [];

    return { section, steps: [waitingRunnerStep, ...steps] };
  });

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
