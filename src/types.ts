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
  showCompositeActions?: boolean;
};

// Represents a parsed step from job logs
export type ParsedLogStep = {
  name: string;
  startedAt: Date;
  completedAt: Date;
};

// Represents a composite action with its inner steps
export type CompositeActionStep = {
  parentStepName: string;
  parentStepNumber: number;
  innerSteps: ParsedLogStep[];
};

// Job logs keyed by job ID
export type JobLogs = Map<number, string>;
