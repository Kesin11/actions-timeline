// import * as github from "npm:@actions/github@5.1.1";
// import { RestEndpointMethodTypes } from "npm:@octokit/plugin-rest-endpoint-methods@9.0.0";
import { Octokit, RestEndpointMethodTypes } from "npm:@octokit/rest@20.0.1";
import { format } from "npm:date-fns@2.30.0";

export type Workflow =
  RestEndpointMethodTypes["actions"]["getWorkflowRun"]["response"]["data"];
export type WorkflowJobs =
  RestEndpointMethodTypes["actions"]["listJobsForWorkflowRun"]["response"][
    "data"
  ]["jobs"];

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

export const fetchWorkflow = async (
  owner: string,
  repo: string,
  runId: number,
): Promise<Workflow> => {
  const token = Deno.env.get("GITHUB_TOKEN")!;
  const octokit = new Octokit({
    auth: token,
    // baseUrl: baseUrl ? baseUrl : "https://api.github.com",
  });

  const workflow = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  return workflow.data;
};

export const fetchWorkflowRunJobs = async (
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowJobs> => {
  const token = Deno.env.get("GITHUB_TOKEN")!;
  const octokit = new Octokit({
    auth: token,
    // baseUrl: baseUrl ? baseUrl : "https://api.github.com",
  });

  const workflowJob = await octokit.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  return workflowJob.data.jobs;
};

type ganttJob = {
  section: string;
  steps: {
    name: string;
    status: "" | "done" | "active" | "crit";
    id: string;
    position: string;
    sec: number;
  }[];
};
export const createGantt = (
  workflow: Workflow,
  workflowJobs: WorkflowJobs,
): string => {
  const title = workflowJobs[0].workflow_name;
  const jobs = workflowJobs.map((job, jobIndex, _jobs): ganttJob => {
    const section = job.name;
    const steps = job.steps?.map((step, stepIndex, _steps) => {
      const startJobElapsedSec = diffSec(workflow.created_at, job.started_at);
      const position = stepIndex === 0
        ? formatElapsedTime(startJobElapsedSec)
        : `after job${jobIndex}-${stepIndex - 1}`;
      return {
        name: step.name,
        id: `job${jobIndex}-${stepIndex}`,
        status: "" as const,
        position,
        sec: diffSec(step.started_at!, step.completed_at!),
      };
    }) ?? [];
    return { section, steps };
  });

  return `
\`\`\`mermaid
gantt
title ${title}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${jobs[0].section}
${
    jobs[0].steps.map((step) =>
      `${step.name} :${step.id}, ${step.position}, ${step.sec}s`
    ).join("\n")
  }
\`\`\`
`;
};
