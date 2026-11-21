import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { test } from "node:test";
import type { WorkflowRun } from "../src/github/github.ts";
import {
  buildHtmlReportData,
  computeScaleSec,
  createHtmlReport,
} from "../src/output/html/report.ts";
import type { TimelineJobs } from "../src/models/types.ts";

const baseRun: WorkflowRun = {
  id: 1001,
  run_number: 42,
  name: "CI",
  event: "push",
  head_sha: "abcdef1234567890",
  head_branch: "main",
  conclusion: "success",
  html_url: "https://github.com/owner/repo/actions/runs/1001",
  path: ".github/workflows/ci.yml",
  run_attempt: 1,
  run_started_at: "2026-01-01T00:00:00Z",
  repository: {
    name: "repo",
    owner: { login: "owner" },
  },
};

test(computeScaleSec.name, () => {
  assertEquals(computeScaleSec(55), 60);
  assertEquals(computeScaleSec(865), 900);
  assertEquals(computeScaleSec(732), 900);
  assertEquals(computeScaleSec(0), 6);
});

test(buildHtmlReportData.name, async (t) => {
  await t.test(
    "groups composite and parallel steps, strips prefixes, and marks CP children",
    () => {
      const jobs: TimelineJobs = [
        {
          id: 10,
          name: "test",
          html_url: "https://github.com/owner/repo/actions/runs/1001/job/10",
          status: "completed",
          conclusion: "success",
          created_at: "2026-01-01T00:00:00Z",
          started_at: "2026-01-01T00:00:05Z",
          completed_at: "2026-01-01T00:01:30Z",
          steps: [
            {
              name: "Prepare",
              number: 1,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:05Z",
              completed_at: "2026-01-01T00:00:35Z",
            },
            {
              name: "(sub) Install deps",
              number: 1,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:05.500Z",
              completed_at: "2026-01-01T00:00:20.000Z",
              timelineRowKind: "composite-child",
            },
            {
              name: "(sub) Build",
              number: 1,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:20.000Z",
              completed_at: "2026-01-01T00:00:35.000Z",
              timelineRowKind: "composite-child",
            },
            {
              name: "Parallel group",
              number: 2,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:35Z",
              completed_at: "2026-01-01T00:01:30Z",
              timelineRowKind: "parallel-parent",
            },
            {
              name: "(bg) Fast task",
              timelineOriginalName: "Fast task",
              number: 2,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:35Z",
              completed_at: "2026-01-01T00:00:55Z",
              timelineRowKind: "parallel-child",
            },
            {
              name: "(bg) Slow task",
              timelineOriginalName: "Slow task",
              number: 3,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:35Z",
              completed_at: "2026-01-01T00:01:30Z",
              timelineRowKind: "parallel-child",
            },
          ],
        },
        {
          id: 20,
          name: "deploy",
          html_url: "https://github.com/owner/repo/actions/runs/1001/job/20",
          status: "completed",
          conclusion: "skipped",
          started_at: null,
          completed_at: null,
          steps: [],
        },
      ];

      const data = buildHtmlReportData(baseRun, jobs);

      assertEquals(data.wallSec, 90);
      assertEquals(data.scaleSec, 90);
      assertEquals(data.jobs.length, 2);
      assertEquals(data.jobs[0].isCp, true);
      assertEquals(data.jobs[0].waitDur, 5);
      assertEquals(data.jobs[0].execDur, 85);
      assertEquals(data.jobs[0].items, [
        {
          kind: "composite",
          name: "Prepare",
          number: 1,
          conclusion: "success",
          start: 5,
          end: 35,
          dur: 30,
          isCp: true,
          children: [
            {
              name: "Install deps",
              number: 1,
              conclusion: "success",
              start: 5.5,
              end: 20,
              dur: 14.5,
              isCp: true,
            },
            {
              name: "Build",
              number: 1,
              conclusion: "success",
              start: 20,
              end: 35,
              dur: 15,
              isCp: true,
            },
          ],
        },
        {
          kind: "parallel",
          name: "Parallel group",
          number: 2,
          conclusion: "success",
          start: 35,
          end: 90,
          dur: 55,
          isCp: true,
          children: [
            {
              name: "Fast task",
              number: 2,
              conclusion: "success",
              start: 35,
              end: 55,
              dur: 20,
              isCp: false,
            },
            {
              name: "Slow task",
              number: 3,
              conclusion: "success",
              start: 35,
              end: 90,
              dur: 55,
              isCp: true,
            },
          ],
        },
      ]);
      assertEquals(data.jobs[1].conclusion, "skipped");
      assertEquals(data.jobs[1].isCp, false);
    },
  );

  await t.test(
    "groups parallel children with nested composite rows and counts actual steps",
    () => {
      const jobs: TimelineJobs = [
        {
          id: 20,
          name: "build",
          status: "completed",
          conclusion: "success",
          created_at: "2026-01-01T00:00:00Z",
          started_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-01-01T00:00:50Z",
          html_url: "https://github.com/owner/repo/actions/runs/42/job/20",
          steps: [
            {
              name: "Parallel group",
              number: 4,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:00Z",
              completed_at: "2026-01-01T00:00:50Z",
              timelineRowKind: "parallel-parent",
            },
            {
              name: "(bg) Setup A",
              timelineOriginalName: "Setup A",
              number: 2,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:00Z",
              completed_at: "2026-01-01T00:00:20Z",
              timelineRowKind: "parallel-child",
            },
            {
              name: "(sub) A sub 1",
              number: 2,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:00Z",
              completed_at: "2026-01-01T00:00:10Z",
              timelineRowKind: "composite-child",
            },
            {
              name: "(sub) A sub 2",
              number: 2,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:10Z",
              completed_at: "2026-01-01T00:00:20Z",
              timelineRowKind: "composite-child",
            },
            {
              name: "(bg) Slow B",
              timelineOriginalName: "Slow B",
              number: 3,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:00Z",
              completed_at: "2026-01-01T00:00:50Z",
              timelineRowKind: "parallel-child",
            },
            {
              name: "Done",
              number: 5,
              status: "completed",
              conclusion: "success",
              started_at: "2026-01-01T00:00:50Z",
              completed_at: "2026-01-01T00:00:50Z",
            },
          ],
        },
      ];

      const data = buildHtmlReportData(baseRun, jobs);
      const job = data.jobs[0];

      assertEquals(job.rawStepCount, 3);
      assertEquals(job.items.length, 2);

      const parallel = job.items[0];
      assertEquals(parallel.kind, "parallel");
      assertEquals(parallel.children.length, 2);
      assertEquals(parallel.children[0].name, "Setup A");
      assertEquals(parallel.children[0].isCp, false);
      assertEquals(
        parallel.children[0].children?.map((s) => s.name),
        ["A sub 1", "A sub 2"],
      );
      assertEquals(parallel.children[1].name, "Slow B");
      assertEquals(parallel.children[1].isCp, true);
      assertEquals(job.items[1].name, "Done");
    },
  );
});

test(createHtmlReport.name, () => {
  const jobs: TimelineJobs = [
    {
      id: 1,
      name: "build </script><script>alert(1)</script>",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-01-01T00:00:01Z",
      completed_at: "2026-01-01T00:00:11Z",
      steps: [],
    },
  ];

  const html = createHtmlReport({ ...baseRun, conclusion: "failure" }, jobs, {
    showWaitingRunner: false,
  });

  assertEquals(html.startsWith("<!DOCTYPE html>"), true);
  assertEquals(html.includes("run-card is-failed"), true);
  assertEquals(html.includes("</script><script>alert(1)</script>"), false);
  assertEquals(html.includes("\\u003c/script>"), true);
  assertEquals(html.includes('id="toggleWait" checked'), false);

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assertEquals(scriptMatch !== null, true);
  new Function(scriptMatch?.[1] ?? "");
});
