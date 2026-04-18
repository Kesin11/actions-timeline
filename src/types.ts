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

// SVG描画用の解決済みステップ型（position文字列を絶対秒数に変換したもの）
export type SvgGanttStep = {
  name: string;
  id: `job${number}-${number}`;
  status: "" | "done" | "active" | "crit";
  startSec: number; // ワークフロー開始からの絶対秒数
  durationSec: number; // 継続秒数（ganttStep.sec と同値）
};

export type SvgGanttJob = {
  section: string;
  steps: SvgGanttStep[];
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
