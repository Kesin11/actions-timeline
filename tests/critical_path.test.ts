import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { test } from "node:test";
import {
  computeCriticalPathJobIds,
  pickCriticalParallelChildIndex,
} from "../src/critical_path.ts";
import { FileContent } from "../src/github.ts";
import type { TimelineJob } from "../src/types.ts";
import { WorkflowModel } from "../src/workflow_file.ts";

const makeWorkflowModel = (yamlContent: string): WorkflowModel => {
  const fileContent = new FileContent({
    type: "file",
    size: yamlContent.length,
    name: "ci.yml",
    path: ".github/workflows/ci.yml",
    content: Buffer.from(yamlContent, "utf8").toString("base64"),
    sha: "abc123",
    url: "https://api.github.com/repos/owner/repo/contents/.github/workflows/ci.yml",
    git_url: null,
    html_url: null,
    download_url: null,
  });
  return new WorkflowModel(fileContent);
};

const makeJob = (
  overrides: Partial<TimelineJob> & { id: number; name: string },
): TimelineJob => ({
  status: "completed",
  conclusion: "success",
  started_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:01:00Z",
  steps: [],
  ...overrides,
});

test(computeCriticalPathJobIds.name, async (t) => {
  await t.test(
    "picks the latest-finishing job when workflowModel is absent",
    () => {
      const jobs = [
        makeJob({ id: 1, name: "lint", completed_at: "2026-01-01T00:01:00Z" }),
        makeJob({ id: 2, name: "test", completed_at: "2026-01-01T00:05:00Z" }),
        makeJob({ id: 3, name: "build", completed_at: "2026-01-01T00:03:00Z" }),
      ];

      assertEquals(Array.from(computeCriticalPathJobIds(jobs)), [2]);
    },
  );

  await t.test(
    "follows needs to the latest-finishing upstream dependency",
    () => {
      const workflow = makeWorkflowModel(`
name: CI
jobs:
  setup:
    runs-on: ubuntu-latest
  lint:
    needs: setup
    runs-on: ubuntu-latest
  test:
    needs: setup
    runs-on: ubuntu-latest
  deploy:
    needs: [lint, test]
    runs-on: ubuntu-latest
`);
      const jobs = [
        makeJob({
          id: 10,
          name: "setup",
          started_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-01-01T00:01:00Z",
        }),
        makeJob({
          id: 20,
          name: "lint",
          started_at: "2026-01-01T00:01:00Z",
          completed_at: "2026-01-01T00:02:00Z",
        }),
        makeJob({
          id: 30,
          name: "test",
          started_at: "2026-01-01T00:01:00Z",
          completed_at: "2026-01-01T00:06:00Z",
        }),
        makeJob({
          id: 40,
          name: "deploy",
          started_at: "2026-01-01T00:06:00Z",
          completed_at: "2026-01-01T00:07:00Z",
        }),
      ];

      assertEquals(
        Array.from(computeCriticalPathJobIds(jobs, workflow)).sort(
          (a, b) => a - b,
        ),
        [10, 30, 40],
      );
    },
  );

  await t.test("picks the slowest matrix instance across needs", () => {
    const workflow = makeWorkflowModel(`
name: CI
jobs:
  changes:
    runs-on: ubuntu-latest
  test:
    needs: changes
    runs-on: ubuntu-latest
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
  ci-ok:
    needs: [changes, test]
    runs-on: ubuntu-latest
`);
    const jobs = [
      makeJob({
        id: 1,
        name: "changes",
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:10Z",
      }),
      makeJob({
        id: 2,
        name: "test (ubuntu-latest)",
        started_at: "2026-01-01T00:00:15Z",
        completed_at: "2026-01-01T00:03:00Z",
      }),
      makeJob({
        id: 3,
        name: "test (windows-latest)",
        started_at: "2026-01-01T00:00:20Z",
        completed_at: "2026-01-01T00:09:00Z",
      }),
      makeJob({
        id: 4,
        name: "ci-ok",
        started_at: "2026-01-01T00:09:05Z",
        completed_at: "2026-01-01T00:09:10Z",
      }),
    ];

    assertEquals(
      Array.from(computeCriticalPathJobIds(jobs, workflow)).sort(
        (a, b) => a - b,
      ),
      [1, 3, 4],
    );
  });

  await t.test("ignores skipped jobs", () => {
    const workflow = makeWorkflowModel(`
name: CI
jobs:
  build:
    runs-on: ubuntu-latest
  deploy:
    needs: build
    runs-on: ubuntu-latest
`);
    const jobs = [
      makeJob({
        id: 1,
        name: "build",
        conclusion: "failure",
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:02:00Z",
      }),
      makeJob({
        id: 2,
        name: "deploy",
        conclusion: "skipped",
        started_at: null,
        completed_at: null,
      }),
    ];

    assertEquals(Array.from(computeCriticalPathJobIds(jobs, workflow)), [1]);
  });

  await t.test("handles cyclic needs without infinite loop", () => {
    const workflow = makeWorkflowModel(`
name: Cyclic
jobs:
  a:
    needs: b
  b:
    needs: a
`);
    const jobs = [
      makeJob({ id: 1, name: "a", completed_at: "2026-01-01T00:01:00Z" }),
      makeJob({ id: 2, name: "b", completed_at: "2026-01-01T00:02:00Z" }),
    ];

    assertEquals(
      Array.from(computeCriticalPathJobIds(jobs, workflow)).sort(
        (a, b) => a - b,
      ),
      [1, 2],
    );
  });
});

test(pickCriticalParallelChildIndex.name, async (t) => {
  await t.test("picks the latest-finishing non-skipped child", () => {
    const children = [
      { start: 10, end: 40, conclusion: "success" },
      { start: 12, end: 75, conclusion: "success" },
      { start: 10, end: 60, conclusion: "success" },
    ];
    assertEquals(pickCriticalParallelChildIndex(children), 1);
  });

  await t.test("breaks ties by longer duration then earlier index", () => {
    const children = [
      { start: 20, end: 60, conclusion: "success" },
      { start: 10, end: 60, conclusion: "success" },
    ];
    assertEquals(pickCriticalParallelChildIndex(children), 1);
  });

  await t.test("returns -1 when all children are skipped", () => {
    const children = [{ start: null, end: null, conclusion: "skipped" }];
    assertEquals(pickCriticalParallelChildIndex(children), -1);
  });
});
