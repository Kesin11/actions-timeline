import { assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";
import { createMermaid } from "../src/workflow_gantt.ts";
import { Workflow, WorkflowJobs } from "../src/github.ts";

const commonWorkflow = {
  "id": 5833450919,
  "name": "Check self-hosted runner",
  "run_number": 128,
  "event": "workflow_dispatch",
  "status": "completed",
  "conclusion": "success",
  "workflow_id": 10970418,
  "created_at": "2023-08-11T14:00:48Z",
  "updated_at": "2023-08-11T14:01:56Z",
  "run_started_at": "2023-08-11T14:00:48Z",
} as unknown as Workflow;

Deno.test("2 section gantt", async (t) => {
  await t.step("all steps are success", () => {
    const workflow = { ...commonWorkflow };
    const workflowJobs = [
      {
        "id": 15820938470,
        "run_id": 5833450919,
        "workflow_name": "Check self-hosted runner",
        "status": "completed",
        "conclusion": "success",
        "created_at": "2023-08-11T14:00:50Z",
        "started_at": "2023-08-11T14:01:31Z",
        "completed_at": "2023-08-11T14:01:36Z",
        "name": "node",
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1,
            "started_at": "2023-08-11T23:01:30.000+09:00",
            "completed_at": "2023-08-11T23:01:32.000+09:00",
          },
          {
            "name": "Set up runner",
            "status": "completed",
            "conclusion": "success",
            "number": 2,
            "started_at": "2023-08-11T23:01:32.000+09:00",
            "completed_at": "2023-08-11T23:01:32.000+09:00",
          },
          {
            "name": "Run actions/checkout@v3",
            "status": "completed",
            "conclusion": "success",
            "number": 3,
            "started_at": "2023-08-11T23:01:34.000+09:00",
            "completed_at": "2023-08-11T23:01:34.000+09:00",
          },
          {
            "name": "Run actions/setup-node@v3",
            "status": "completed",
            "conclusion": "success",
            "number": 4,
            "started_at": "2023-08-11T23:01:35.000+09:00",
            "completed_at": "2023-08-11T23:01:35.000+09:00",
          },
          {
            "name": "Post Run actions/setup-node@v3",
            "status": "completed",
            "conclusion": "success",
            "number": 6,
            "started_at": "2023-08-11T23:01:35.000+09:00",
            "completed_at": "2023-08-11T23:01:35.000+09:00",
          },
          {
            "name": "Post Run actions/checkout@v3",
            "status": "completed",
            "conclusion": "success",
            "number": 7,
            "started_at": "2023-08-11T23:01:35.000+09:00",
            "completed_at": "2023-08-11T23:01:35.000+09:00",
          },
          {
            "name": "Complete runner",
            "status": "completed",
            "conclusion": "success",
            "number": 8,
            "started_at": "2023-08-11T23:01:36.000+09:00",
            "completed_at": "2023-08-11T23:01:36.000+09:00",
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 9,
            "started_at": "2023-08-11T23:01:35.000+09:00",
            "completed_at": "2023-08-11T23:01:35.000+09:00",
          },
        ],
      },
      {
        "id": 15820938790,
        "run_id": 5833450919,
        "workflow_name": "Check self-hosted runner",
        "status": "completed",
        "conclusion": "success",
        "created_at": "2023-08-11T14:00:51Z",
        "started_at": "2023-08-11T14:01:30Z",
        "completed_at": "2023-08-11T14:01:50Z",
        "name": "go",
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1,
            "started_at": "2023-08-11T23:01:29.000+09:00",
            "completed_at": "2023-08-11T23:01:32.000+09:00",
          },
          {
            "name": "Set up runner",
            "status": "completed",
            "conclusion": "success",
            "number": 2,
            "started_at": "2023-08-11T23:01:32.000+09:00",
            "completed_at": "2023-08-11T23:01:32.000+09:00",
          },
          {
            "name": "Run actions/setup-go@v4",
            "status": "completed",
            "conclusion": "success",
            "number": 3,
            "started_at": "2023-08-11T23:01:33.000+09:00",
            "completed_at": "2023-08-11T23:01:49.000+09:00",
          },
          {
            "name": "Run go version",
            "status": "completed",
            "conclusion": "success",
            "number": 4,
            "started_at": "2023-08-11T23:01:49.000+09:00",
            "completed_at": "2023-08-11T23:01:49.000+09:00",
          },
          {
            "name": "Post Run actions/setup-go@v4",
            "status": "completed",
            "conclusion": "success",
            "number": 7,
            "started_at": "2023-08-11T23:01:49.000+09:00",
            "completed_at": "2023-08-11T23:01:49.000+09:00",
          },
          {
            "name": "Complete runner",
            "status": "completed",
            "conclusion": "success",
            "number": 8,
            "started_at": "2023-08-11T23:01:50.000+09:00",
            "completed_at": "2023-08-11T23:01:50.000+09:00",
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 9,
            "started_at": "2023-08-11T23:01:49.000+09:00",
            "completed_at": "2023-08-11T23:01:49.000+09:00",
          },
        ],
      },
    ] as unknown as WorkflowJobs;

    // deno-fmt-ignore
    const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
Waiting for a runner (41s) :active, job0-0, 00:00:02, 41s
${workflowJobs[0].steps![0].name} (2s) :job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} (0s) :job0-2, after job0-1, 0s
${workflowJobs[0].steps![2].name} (0s) :job0-3, after job0-2, 0s
${workflowJobs[0].steps![3].name} (0s) :job0-4, after job0-3, 0s
${workflowJobs[0].steps![4].name} (0s) :job0-5, after job0-4, 0s
${workflowJobs[0].steps![5].name} (0s) :job0-6, after job0-5, 0s
${workflowJobs[0].steps![6].name} (0s) :job0-7, after job0-6, 0s
${workflowJobs[0].steps![7].name} (0s) :job0-8, after job0-7, 0s
section ${workflowJobs[1].name}
Waiting for a runner (39s) :active, job1-0, 00:00:03, 39s
${workflowJobs[1].steps![0].name} (3s) :job1-1, after job1-0, 3s
${workflowJobs[1].steps![1].name} (0s) :job1-2, after job1-1, 0s
${workflowJobs[1].steps![2].name} (16s) :job1-3, after job1-2, 16s
${workflowJobs[1].steps![3].name} (0s) :job1-4, after job1-3, 0s
${workflowJobs[1].steps![4].name} (0s) :job1-5, after job1-4, 0s
${workflowJobs[1].steps![5].name} (0s) :job1-6, after job1-5, 0s
${workflowJobs[1].steps![6].name} (0s) :job1-7, after job1-6, 0s
\`\`\``;

    assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
  });

  await t.step("Hide skipped jobs", () => {
    const workflow = { ...commonWorkflow };
    const workflowJobs = [
      {
        "id": 15820938470,
        "run_id": 5833450919,
        "workflow_name": "Check self-hosted runner",
        "status": "completed",
        "conclusion": "success",
        "created_at": "2023-08-11T14:00:50Z",
        "started_at": "2023-08-11T14:01:31Z",
        "completed_at": "2023-08-11T14:01:36Z",
        "name": "node",
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1,
            "started_at": "2023-08-11T23:01:30.000+09:00",
            "completed_at": "2023-08-11T23:01:32.000+09:00",
          },
          {
            "name": "Set up runner",
            "status": "completed",
            "conclusion": "success",
            "number": 2,
            "started_at": "2023-08-11T23:01:32.000+09:00",
            "completed_at": "2023-08-11T23:01:32.000+09:00",
          },
          {
            "name": "Run actions/checkout@v3",
            "status": "completed",
            "conclusion": "success",
            "number": 3,
            "started_at": "2023-08-11T23:01:34.000+09:00",
            "completed_at": "2023-08-11T23:01:34.000+09:00",
          },
        ],
      },
      {
        "id": 15820938790,
        "run_id": 5833450919,
        "workflow_name": "Check self-hosted runner",
        "status": "completed",
        "conclusion": "skipped",
        "created_at": "2023-08-11T14:00:51Z",
        "started_at": "2023-08-11T14:00:51Z",
        "completed_at": "2023-08-11T14:01:50Z",
        "name": "skipped test",
        "steps": [],
      },
    ] as unknown as WorkflowJobs;

    // deno-fmt-ignore
    const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
Waiting for a runner (41s) :active, job0-0, 00:00:02, 41s
${workflowJobs[0].steps![0].name} (2s) :job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} (0s) :job0-2, after job0-1, 0s
${workflowJobs[0].steps![2].name} (0s) :job0-3, after job0-2, 0s
\`\`\``;

    assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
  });
});
