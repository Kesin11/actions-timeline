import type { WorkflowJobs } from "@kesin11/gha-utils";

export type TimelineStep =
  & NonNullable<WorkflowJobs[number]["steps"]>[number]
  & {
    timelineRowKind?: "composite-child";
  };

export type TimelineJob = Omit<WorkflowJobs[number], "steps"> & {
  steps?: TimelineStep[];
};

export type TimelineJobs = TimelineJob[];

export type ganttJob = {
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
export type StepConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

export type GanttOptions = {
  showWaitingRunner?: boolean;
};
