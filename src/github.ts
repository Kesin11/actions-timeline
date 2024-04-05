// @octokit/rest@20 dropped support for node16. However, node16 bundled in actions/runner and still supported.
// So, we use @octokit/rest@19.
import { Octokit, RestEndpointMethodTypes } from "npm:@octokit/rest@20.1.0";
import process from "node:process";

export type Workflow =
  RestEndpointMethodTypes["actions"]["getWorkflowRunAttempt"]["response"][
    "data"
  ];
export type WorkflowJobs =
  RestEndpointMethodTypes["actions"]["listJobsForWorkflowRunAttempt"][
    "response"
  ][
    "data"
  ]["jobs"];
type WorkflowUrl = {
  origin: string;
  owner: string;
  repo: string;
  runId: number;
  runAttempt?: number;
};

export const createOctokitForAction = (token: string): Octokit => {
  const baseUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  return new Octokit({
    auth: token,
    baseUrl,
  });
};

export const createOctokitForCli = (
  options: { token?: string; origin?: string },
): Octokit => {
  const baseUrl = (options.origin === "https://github.com")
    ? "https://api.github.com" // gitHub.com
    : `${options.origin}/api/v3`; // GHES
  return new Octokit({
    auth: options.token,
    baseUrl,
  });
};

export const fetchWorkflow = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  runId: number,
  runAttempt: number,
): Promise<Workflow> => {
  const workflow = await octokit.rest.actions.getWorkflowRunAttempt({
    owner,
    repo,
    run_id: runId,
    attempt_number: runAttempt,
  });
  return workflow.data;
};

export const fetchWorkflowLatestAttempt = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  runId: number,
): Promise<number> => {
  const workflow = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  return workflow.data.run_attempt ?? 1;
};

export const fetchWorkflowRunJobs = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  runId: number,
  runAttempt: number,
): Promise<WorkflowJobs> => {
  const workflowJob = await octokit.rest.actions.listJobsForWorkflowRunAttempt({
    owner,
    repo,
    run_id: runId,
    attempt_number: runAttempt,
    per_page: 100,
  });
  return workflowJob.data.jobs;
};

export const parseWorkflowRunUrl = (runUrl: string): WorkflowUrl => {
  const url = new URL(runUrl);
  const path = url.pathname.split("/");
  const owner = path[1];
  const repo = path[2];
  const runId = Number(path[5]);
  const runAttempt = path[6] === "attempts" ? Number(path[7]) : undefined;
  return {
    origin: url.origin,
    owner,
    repo,
    runId,
    runAttempt: runAttempt,
  };
};
