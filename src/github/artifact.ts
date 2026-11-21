import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import type { WorkflowJobs, WorkflowRun } from "./github.ts";

export type ArtifactUploadResult = {
  artifactName: string;
  artifactId?: number;
  size?: number;
};

export type ArtifactUploader = (
  html: string,
  artifactName: string,
) => Promise<ArtifactUploadResult>;

const INVALID_ARTIFACT_CHARS = /["<>:|*?/\\\s]+/g;

export const sanitizeArtifactSegment = (value: string): string => {
  const withoutControls = Array.from(value, (ch) =>
    ch.charCodeAt(0) < 0x20 ? "-" : ch,
  ).join("");
  const sanitized = withoutControls
    .replace(INVALID_ARTIFACT_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.length > 0 ? sanitized : "workflow";
};

export const resolveCurrentJobId = (
  workflowJobs: WorkflowJobs,
  runnerName: string | undefined,
): number | undefined => {
  const targetRunner = runnerName?.trim();
  if (!targetRunner) return undefined;

  const matching = workflowJobs.filter(
    (job) => job.runner_name === targetRunner,
  );
  if (matching.length === 0) return undefined;

  const inProgress = matching.findLast((job) => job.status === "in_progress");
  return (inProgress ?? matching.at(-1))?.id;
};

export const resolveHtmlArtifactName = (
  jobName: string | undefined,
  runAttempt: number,
  uniqueJobKey?: string | number,
): string => {
  const safeJob = sanitizeArtifactSegment(jobName?.trim() || "workflow");
  const rawUnique =
    uniqueJobKey !== undefined ? String(uniqueJobKey).trim() : "";
  if (rawUnique.length > 0) {
    const safeUnique = sanitizeArtifactSegment(rawUnique);
    return `actions-timeline-${safeJob}-${safeUnique}-attempt${runAttempt}.html`;
  }
  return `actions-timeline-${safeJob}-attempt${runAttempt}.html`;
};

export const buildArtifactUrl = (
  workflowRun: WorkflowRun,
  repository: { owner: string; repo: string; runId: number },
  artifactId: number | undefined,
  serverUrl?: string,
): string => {
  const runHtmlUrl =
    typeof workflowRun.html_url === "string" ? workflowRun.html_url : "";
  const origin = (() => {
    if (runHtmlUrl.length > 0) {
      try {
        return new URL(runHtmlUrl).origin;
      } catch {
        // Fall back to serverUrl below
      }
    }
    return (serverUrl?.trim() || "https://github.com").replace(/\/$/, "");
  })();

  if (artifactId !== undefined) {
    return `${origin}/${repository.owner}/${repository.repo}/actions/runs/${repository.runId}/artifacts/${artifactId}`;
  }
  return `${origin}/${repository.owner}/${repository.repo}/actions/runs/${repository.runId}#artifacts`;
};

export const uploadHtmlArtifact: ArtifactUploader = async (
  html: string,
  artifactName: string,
): Promise<ArtifactUploadResult> => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "actions-timeline-"));
  const filePath = path.join(tmpDir, artifactName);
  try {
    await writeFile(filePath, html, "utf8");
    const artifactClient = new DefaultArtifactClient();
    // With skipArchive: true, @actions/artifact uploads the raw file directly
    // (preserving text/html MIME type) and uses the filename as the artifact name.
    const response = await artifactClient.uploadArtifact(
      artifactName,
      [filePath],
      tmpDir,
      { skipArchive: true },
    );
    return {
      artifactName,
      artifactId: response.id,
      size: response.size,
    };
  } finally {
    await rm(tmpDir, { force: true, recursive: true });
  }
};
