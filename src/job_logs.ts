import type { Github, WorkflowJobs } from "@kesin11/gha-utils";
import type { JobLogs } from "./types.ts";

// Pattern to detect repo-local composite action usage in step name
// e.g., "Run ./.github/actions/setup-deno-with-cache"
const REPO_LOCAL_COMPOSITE_PATTERN = /^Run \.\/\.github\/actions\//;

/**
 * Check if a job likely contains a repo-local composite action step.
 * This is used to minimize API calls by only fetching logs for relevant jobs.
 */
export const hasRepoLocalCompositeStep = (
  job: WorkflowJobs[0],
): boolean => {
  if (!job.steps) return false;
  return job.steps.some((step) =>
    REPO_LOCAL_COMPOSITE_PATTERN.test(step.name)
  );
};

/**
 * Fetch job logs for jobs that contain repo-local composite actions.
 * Returns a Map keyed by job ID.
 */
export const fetchJobLogs = async (
  client: Github,
  owner: string,
  repo: string,
  workflowJobs: WorkflowJobs,
): Promise<JobLogs> => {
  const jobLogs: JobLogs = new Map();

  // Filter jobs that likely contain repo-local composite actions
  const relevantJobs = workflowJobs.filter(hasRepoLocalCompositeStep);

  // Fetch logs for each relevant job
  for (const job of relevantJobs) {
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
