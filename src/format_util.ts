import { format } from "npm:date-fns@3.6.0";
import type { ganttJob, ganttStep, StepConclusion } from "./types.ts";

export const diffSec = (
  start?: string | Date | null,
  end?: string | Date | null,
): number => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);

  return (endDate.getTime() - startDate.getTime()) / 1000;
};

// Sec to elapsed format time like HH:mm:ss (ex. 70sec -> 00:01:10)
export const formatElapsedTime = (sec: number): string => {
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

export const formatName = (name: string, sec: number): string => {
  return `${escapeName(name)} (${formatShortElapsedTime(sec)})`;
};

export const escapeName = (name: string): string => {
  let escapedName = name;
  escapedName = escapedName.replaceAll(":", "");
  escapedName = escapedName.replaceAll(";", "");
  return escapedName;
};

export function formatSection(job: ganttJob): string {
  return [
    `section ${job.section}`,
    ...job.steps.map((step) => formatStep(step)),
  ].join("\n");
}

export const convertStepToStatus = (
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
