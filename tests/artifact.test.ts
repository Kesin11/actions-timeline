import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { test } from "node:test";
import {
  buildArtifactUrl,
  ensureHtmlExtension,
  resolveHtmlArtifactName,
  sanitizeArtifactSegment,
} from "../src/artifact.ts";
import type { WorkflowRun } from "../src/github.ts";

test(sanitizeArtifactSegment.name, () => {
  assertEquals(
    sanitizeArtifactSegment("build (ubuntu-latest)"),
    "build-(ubuntu-latest)",
  );
  assertEquals(sanitizeArtifactSegment("foo/bar:baz*qux"), "foo-bar-baz-qux");
  assertEquals(sanitizeArtifactSegment("   "), "workflow");
  assertEquals(sanitizeArtifactSegment("a---b"), "a-b");
});

test(ensureHtmlExtension.name, () => {
  assertEquals(ensureHtmlExtension("report"), "report.html");
  assertEquals(ensureHtmlExtension("report.html"), "report.html");
  assertEquals(ensureHtmlExtension("report.HTML"), "report.HTML");
});

test(resolveHtmlArtifactName.name, () => {
  assertEquals(
    resolveHtmlArtifactName("", "build / test", 2),
    "actions-timeline-build-test-attempt2.html",
  );
  assertEquals(
    resolveHtmlArtifactName(undefined, undefined, 1),
    "actions-timeline-workflow-attempt1.html",
  );
  assertEquals(
    resolveHtmlArtifactName("custom timeline", "build", 1),
    "custom-timeline.html",
  );
  assertEquals(
    resolveHtmlArtifactName("my-report.html", "build", 1),
    "my-report.html",
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
