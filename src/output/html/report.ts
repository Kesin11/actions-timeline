import {
  computeCriticalPathJobIds,
  pickCriticalParallelChildIndex,
} from "../../logic/critical_path.ts";
import type { WorkflowRun } from "../../github/github.ts";
import { renderHtmlReport } from "./template.ts";
import type {
  TimelineJob,
  TimelineJobs,
  TimelineStep,
} from "../../models/types.ts";
import type { WorkflowModel } from "../../models/workflow_file.ts";

export type HtmlReportOptions = {
  showWaitingRunner?: boolean;
  workflowModel?: WorkflowModel;
};

export type HtmlStepChild = {
  name: string;
  number: number;
  conclusion: string;
  start: number | null;
  end: number | null;
  dur: number;
  isCp: boolean;
  children?: HtmlStepChild[];
};

export type HtmlStepItem = {
  kind: "step" | "composite" | "parallel";
  name: string;
  number: number;
  conclusion: string;
  start: number | null;
  end: number | null;
  dur: number;
  isCp: boolean;
  children: HtmlStepChild[];
};

export type HtmlJobData = {
  id: number;
  name: string;
  html_url: string;
  conclusion: string;
  isCp: boolean;
  waitStart: number | null;
  waitEnd: number | null;
  waitDur: number;
  start: number | null;
  end: number | null;
  execDur: number;
  totalDur: number;
  rawStepCount: number;
  items: HtmlStepItem[];
};

export type HtmlReportData = {
  repo: string;
  showWaitingRunner: boolean;
  run: {
    id: number;
    run_number: number;
    name: string;
    path: string;
    head_branch: string;
    head_sha: string;
    conclusion: string;
    html_url: string;
  };
  wallSec: number;
  scaleSec: number;
  jobs: HtmlJobData[];
};

const NICE_TICK_STEPS_SEC = [
  1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300, 600, 900, 1200,
  1800, 3600,
];
const AXIS_DIVISIONS = 6;

const parseMs = (value: string | null | undefined): number | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const relSec = (
  originMs: number,
  iso: string | null | undefined,
): number | null => {
  const ms = parseMs(iso);
  if (ms === null) return null;
  return Math.max(0, (ms - originMs) / 1000);
};

const stripSubPrefix = (name: string): string =>
  name.replace(/^\(sub\)\s+/, "");

const stripBgPrefix = (step: TimelineStep): string =>
  step.timelineOriginalName ?? step.name.replace(/^\(bg\)\s+/, "");

const resolveConclusion = (
  conclusion: string | null | undefined,
  status: string | undefined,
): string => {
  if (typeof conclusion === "string" && conclusion.length > 0) {
    return conclusion;
  }
  if (typeof status === "string" && status.length > 0) {
    return status;
  }
  return "unknown";
};

export const computeScaleSec = (wallSec: number): number => {
  const safeWall = Math.max(1, wallSec);
  const matched = NICE_TICK_STEPS_SEC.find(
    (step) => step * AXIS_DIVISIONS >= safeWall,
  );
  if (matched !== undefined) return matched * AXIS_DIVISIONS;
  const hourStep = Math.ceil(safeWall / (AXIS_DIVISIONS * 600)) * 600;
  return hourStep * AXIS_DIVISIONS;
};

const buildStepTiming = (
  originMs: number,
  step: TimelineStep,
  fallbackEndSec: number | null,
): { start: number | null; end: number | null; dur: number } => {
  if (step.conclusion === "skipped") {
    return { start: null, end: null, dur: 0 };
  }
  const start = relSec(originMs, step.started_at);
  if (start === null) {
    return { start: null, end: null, dur: 0 };
  }
  const rawEnd = relSec(originMs, step.completed_at);
  const end =
    rawEnd !== null
      ? Math.max(start, rawEnd)
      : fallbackEndSec !== null
        ? Math.max(start, fallbackEndSec)
        : start;
  return { start, end, dur: Math.max(0, end - start) };
};

const buildJobItems = (
  originMs: number,
  steps: readonly TimelineStep[],
  isJobCp: boolean,
  jobEndSec: number | null,
): HtmlStepItem[] => {
  const items: HtmlStepItem[] = [];
  let idx = 0;

  while (idx < steps.length) {
    const step = steps[idx];

    if (step.timelineRowKind === "parallel-parent") {
      const groupedChildren: {
        child: TimelineStep;
        subSteps: TimelineStep[];
      }[] = [];
      let nextIdx = idx + 1;
      while (
        nextIdx < steps.length &&
        steps[nextIdx].timelineRowKind === "parallel-child"
      ) {
        const parallelChild = steps[nextIdx];
        nextIdx += 1;
        const subSteps: TimelineStep[] = [];
        while (
          nextIdx < steps.length &&
          steps[nextIdx].timelineRowKind === "composite-child" &&
          steps[nextIdx].number === parallelChild.number
        ) {
          subSteps.push(steps[nextIdx]);
          nextIdx += 1;
        }
        groupedChildren.push({ child: parallelChild, subSteps });
      }

      const rawChildren = groupedChildren.map(({ child, subSteps }) => {
        const timing = buildStepTiming(originMs, child, jobEndSec);
        return {
          name: stripBgPrefix(child),
          number: child.number,
          conclusion: resolveConclusion(child.conclusion, child.status),
          start: timing.start,
          end: timing.end,
          dur: timing.dur,
          isCp: false,
          subSteps,
        };
      });

      const parentTiming = buildStepTiming(originMs, step, jobEndSec);
      const parentIsCp = isJobCp && step.conclusion !== "skipped";
      const cpChildIndex = parentIsCp
        ? pickCriticalParallelChildIndex(rawChildren)
        : -1;
      const children: HtmlStepChild[] = rawChildren.map((child, childIdx) => {
        const childIsCp = parentIsCp && childIdx === cpChildIndex;
        const nestedChildren: HtmlStepChild[] = child.subSteps.map((sub) => {
          const subTiming = buildStepTiming(originMs, sub, child.end);
          const subConclusion = resolveConclusion(sub.conclusion, sub.status);
          return {
            name: stripSubPrefix(sub.name),
            number: sub.number,
            conclusion: subConclusion,
            start: subTiming.start,
            end: subTiming.end,
            dur: subTiming.dur,
            isCp: childIsCp && subConclusion !== "skipped",
          };
        });
        return {
          name: child.name,
          number: child.number,
          conclusion: child.conclusion,
          start: child.start,
          end: child.end,
          dur: child.dur,
          isCp: childIsCp,
          ...(nestedChildren.length > 0 ? { children: nestedChildren } : {}),
        };
      });

      items.push({
        kind: "parallel",
        name: step.name,
        number: step.number,
        conclusion: resolveConclusion(step.conclusion, step.status),
        start: parentTiming.start,
        end: parentTiming.end,
        dur: parentTiming.dur,
        isCp: parentIsCp,
        children,
      });
      idx = nextIdx;
      continue;
    }

    const nextStep = steps[idx + 1];
    if (
      step.timelineRowKind === undefined &&
      nextStep?.timelineRowKind === "composite-child"
    ) {
      const childSteps: TimelineStep[] = [];
      let nextIdx = idx + 1;
      while (
        nextIdx < steps.length &&
        steps[nextIdx].timelineRowKind === "composite-child" &&
        steps[nextIdx].number === step.number
      ) {
        childSteps.push(steps[nextIdx]);
        nextIdx += 1;
      }

      const parentTiming = buildStepTiming(originMs, step, jobEndSec);
      const parentIsCp = isJobCp && step.conclusion !== "skipped";
      const children: HtmlStepChild[] = childSteps.map((child) => {
        const timing = buildStepTiming(originMs, child, parentTiming.end);
        const childConclusion = resolveConclusion(
          child.conclusion,
          child.status,
        );
        return {
          name: stripSubPrefix(child.name),
          number: child.number,
          conclusion: childConclusion,
          start: timing.start,
          end: timing.end,
          dur: timing.dur,
          isCp: parentIsCp && childConclusion !== "skipped",
        };
      });

      items.push({
        kind: "composite",
        name: step.name,
        number: step.number,
        conclusion: resolveConclusion(step.conclusion, step.status),
        start: parentTiming.start,
        end: parentTiming.end,
        dur: parentTiming.dur,
        isCp: parentIsCp,
        children,
      });
      idx = nextIdx;
      continue;
    }

    const timing = buildStepTiming(originMs, step, jobEndSec);
    const conclusion = resolveConclusion(step.conclusion, step.status);
    items.push({
      kind: "step",
      name:
        step.timelineRowKind === "composite-child"
          ? stripSubPrefix(step.name)
          : step.timelineRowKind === "parallel-child"
            ? stripBgPrefix(step)
            : step.name,
      number: step.number,
      conclusion,
      start: timing.start,
      end: timing.end,
      dur: timing.dur,
      isCp: isJobCp && conclusion !== "skipped",
      children: [],
    });
    idx += 1;
  }

  return items;
};

const getJobHtmlUrl = (job: TimelineJob): string =>
  typeof job.html_url === "string" ? job.html_url : "";

export const buildHtmlReportData = (
  workflowRun: WorkflowRun,
  workflowJobs: TimelineJobs,
  options: HtmlReportOptions = {},
): HtmlReportData => {
  const originMs = parseMs(workflowRun.run_started_at) ?? 0;
  const cpJobIds = computeCriticalPathJobIds(
    workflowJobs,
    options.workflowModel,
  );

  const jobs: HtmlJobData[] = workflowJobs.map((job) => {
    const conclusion = resolveConclusion(job.conclusion, job.status);
    const isSkip = conclusion === "skipped";
    const isCp = cpJobIds.has(job.id);

    const waitStart =
      !isSkip && job.created_at && job.started_at
        ? relSec(originMs, job.created_at)
        : null;
    const rawWaitEnd =
      waitStart !== null ? relSec(originMs, job.started_at) : null;
    const waitEnd =
      waitStart !== null && rawWaitEnd !== null
        ? Math.max(waitStart, rawWaitEnd)
        : null;
    const waitDur =
      waitStart !== null && waitEnd !== null
        ? Math.max(0, waitEnd - waitStart)
        : 0;

    const start = !isSkip ? relSec(originMs, job.started_at) : null;
    const stepMaxEnd = (job.steps ?? []).reduce<number | null>((max, step) => {
      const end = relSec(originMs, step.completed_at ?? step.started_at);
      if (end === null) return max;
      return max === null ? end : Math.max(max, end);
    }, null);
    const completedSec = !isSkip ? relSec(originMs, job.completed_at) : null;
    const end = isSkip
      ? null
      : completedSec !== null
        ? start !== null
          ? Math.max(start, completedSec)
          : completedSec
        : stepMaxEnd !== null
          ? start !== null
            ? Math.max(start, stepMaxEnd)
            : stepMaxEnd
          : start;

    const execDur =
      start !== null && end !== null ? Math.max(0, end - start) : 0;
    const totalDur = execDur + waitDur;
    const rawSteps = job.steps ?? [];
    const items = isSkip ? [] : buildJobItems(originMs, rawSteps, isCp, end);
    const rawStepCount = isSkip
      ? 0
      : rawSteps.filter(
          (step) =>
            step.timelineRowKind !== "parallel-parent" &&
            step.timelineRowKind !== "composite-child",
        ).length;

    return {
      id: job.id,
      name: job.name,
      html_url: getJobHtmlUrl(job),
      conclusion,
      isCp,
      waitStart,
      waitEnd,
      waitDur,
      start,
      end,
      execDur,
      totalDur,
      rawStepCount,
      items,
    };
  });

  const maxJobEnd = jobs.reduce(
    (max, job) => (job.end !== null ? Math.max(max, job.end) : max),
    0,
  );
  const wallSec = Math.max(1, Math.round(maxJobEnd));
  const scaleSec = computeScaleSec(wallSec);

  const repo = `${workflowRun.repository.owner.login}/${workflowRun.repository.name}`;
  const runNumber =
    typeof workflowRun.run_number === "number"
      ? workflowRun.run_number
      : workflowRun.id;
  const runName = workflowRun.name ?? workflowRun.path;
  const headBranch =
    typeof workflowRun.head_branch === "string" ? workflowRun.head_branch : "";
  const runConclusion = resolveConclusion(
    typeof workflowRun.conclusion === "string" ? workflowRun.conclusion : null,
    typeof workflowRun.status === "string" ? workflowRun.status : undefined,
  );
  const htmlUrl =
    typeof workflowRun.html_url === "string" ? workflowRun.html_url : "";

  return {
    repo,
    showWaitingRunner: options.showWaitingRunner ?? true,
    run: {
      id: workflowRun.id,
      run_number: runNumber,
      name: runName,
      path: workflowRun.path,
      head_branch: headBranch,
      head_sha: workflowRun.head_sha,
      conclusion: runConclusion,
      html_url: htmlUrl,
    },
    wallSec,
    scaleSec,
    jobs,
  };
};

export const createHtmlReport = (
  workflowRun: WorkflowRun,
  workflowJobs: TimelineJobs,
  options: HtmlReportOptions = {},
): string => {
  const data = buildHtmlReportData(workflowRun, workflowJobs, options);
  return renderHtmlReport(data);
};
