import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { test } from "node:test";
import {
  buildArtifactUrl,
  resolveCurrentJobId,
  resolveHtmlArtifactName,
  sanitizeArtifactSegment,
} from "../src/github/artifact.ts";
import type { WorkflowJobs, WorkflowRun } from "../src/github/github.ts";

test(sanitizeArtifactSegment.name, () => {
  assertEquals(
    sanitizeArtifactSegment("build (ubuntu-latest)"),
    "build-(ubuntu-latest)",
  );
  assertEquals(sanitizeArtifactSegment("foo/bar:baz*qux"), "foo-bar-baz-qux");
  assertEquals(sanitizeArtifactSegment("   "), "workflow");
  assertEquals(sanitizeArtifactSegment("a---b"), "a-b");
});

test(resolveCurrentJobId.name, () => {
  const workflowJobs = [
    { id: 101, runner_name: "GitHub Actions 1", status: "completed" },
    { id: 102, runner_name: "GitHub Actions 2", status: "in_progress" },
    { id: 103, runner_name: "GitHub Actions 1", status: "in_progress" },
  ] as unknown as WorkflowJobs;

  assertEquals(resolveCurrentJobId(workflowJobs, "GitHub Actions 2"), 102);
  assertEquals(resolveCurrentJobId(workflowJobs, "GitHub Actions 1"), 103);
  assertEquals(resolveCurrentJobId(workflowJobs, "unknown-runner"), undefined);
  assertEquals(resolveCurrentJobId(workflowJobs, undefined), undefined);
});

test(resolveHtmlArtifactName.name, () => {
  assertEquals(
    resolveHtmlArtifactName("build / test", 2),
    "actions-timeline-build-test-attempt2.html",
  );
  assertEquals(
    resolveHtmlArtifactName("test", 1, 998877),
    "actions-timeline-test-998877-attempt1.html",
  );
  assertEquals(
    resolveHtmlArtifactName("test", 1, "GitHub Actions 4"),
    "actions-timeline-test-GitHub-Actions-4-attempt1.html",
  );
  assertEquals(
    resolveHtmlArtifactName(undefined, 1),
    "actions-timeline-workflow-attempt1.html",
  );
});

test(buildArtifactUrl.name, () => {
  const run = {
    html_url: "https://github.com/owner/repo/actions/runs/123",
  } as unknown as WorkflowRun;
  assertEquals(
    buildArtifactUrl(run, { owner: "owner", repo: "repo", runId: 123 }, 456),
    "https://github.com/owner/repo/actions/runs/123/artifacts/456",
  );
  assertEquals(
    buildArtifactUrl(
      run,
      { owner: "owner", repo: "repo", runId: 123 },
      undefined,
    ),
    "https://github.com/owner/repo/actions/runs/123#artifacts",
  );

  const ghesRun = {
    html_url: "https://ghe.example.com/org/proj/actions/runs/77",
  } as unknown as WorkflowRun;
  assertEquals(
    buildArtifactUrl(ghesRun, { owner: "org", repo: "proj", runId: 77 }, 99),
    "https://ghe.example.com/org/proj/actions/runs/77/artifacts/99",
  );
});
