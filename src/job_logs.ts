import type { Github, WorkflowJobs } from "@kesin11/gha-utils";
import type { JobLogs } from "./types.ts";

/**
 * Fetch job logs for all jobs in the workflow.
 * Composite actions can have custom names in the workflow, so we need to
 * fetch logs and parse them to detect composite actions.
 * Returns a Map keyed by job ID.
 */
export const fetchJobLogs = async (
  client: Github,
  owner: string,
  repo: string,
  workflowJobs: WorkflowJobs,
): Promise<JobLogs> => {
  const jobLogs: JobLogs = new Map();

  // Fetch logs for all jobs (composite actions may have custom names,
  // so we can't filter by step name pattern alone)
  for (const job of workflowJobs) {
    // Skip jobs without steps
    if (!job.steps || job.steps.length === 0) continue;

    try {
      const logs = await fetchSingleJobLogs(client, owner, repo, job.id);
      if (logs) {
        jobLogs.set(job.id, logs);
      }
    } catch (error) {
      // Log fetch failure should not break the timeline
      console.error(`Failed to fetch logs for job ${job.id}:`, error);
    }
  }

  return jobLogs;
};

/**
 * Fetch logs for a single job using the GitHub API.
 * The API returns a 302 redirect to a plain text file.
 */
const fetchSingleJobLogs = async (
  client: Github,
  owner: string,
  repo: string,
  jobId: number,
): Promise<string | undefined> => {
  // Build the URL for job logs endpoint
  // GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs
  const baseUrl = client.baseUrl ?? "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${client.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    console.error(`Failed to fetch job logs: ${response.status}`);
    return undefined;
  }

  return await response.text();
};
