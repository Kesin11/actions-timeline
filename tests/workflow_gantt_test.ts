import { assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";
import {
  createGantt,
  formatShortElapsedTime,
  formatStep,
  ganttStep,
} from "../src/workflow_gantt.ts";
import { Workflow, WorkflowJobs } from "../src/github.ts";

Deno.test("1 section gantt", async (t) => {
  await t.step("all steps are success", () => {
    const workflow = {
      "id": 5977929222,
      "name": "POC",
      "run_number": 5,
      "event": "push",
      "status": "completed",
      "conclusion": "success",
      "workflow_id": 66989622,
      "created_at": "2023-08-25T15:57:51Z",
      "updated_at": "2023-08-25T15:58:19Z",
      "run_started_at": "2023-08-25T15:57:51Z",
    } as unknown as Workflow;

    const workflowJobs = [{
      "id": 16218974194,
      "run_id": 5977929222,
      "workflow_name": "POC",
      "status": "completed",
      "conclusion": "success",
      "created_at": "2023-08-25T15:57:52Z",
      "started_at": "2023-08-25T15:57:59Z",
      "completed_at": "2023-08-25T15:58:17Z",
      "name": "run_self",
      "steps": [
        {
          "name": "Set up job",
          "status": "completed",
          "conclusion": "success",
          "number": 1,
          "started_at": "2023-08-26T00:57:58.000+09:00",
          "completed_at": "2023-08-26T00:58:00.000+09:00",
        },
        {
          "name": "Run actions/checkout@v3",
          "status": "completed",
          "conclusion": "success",
          "number": 2,
          "started_at": "2023-08-26T00:58:00.000+09:00",
          "completed_at": "2023-08-26T00:58:01.000+09:00",
        },
        {
          "name": "Run denoland/setup-deno@v1",
          "status": "completed",
          "conclusion": "success",
          "number": 3,
          "started_at": "2023-08-26T00:58:02.000+09:00",
          "completed_at": "2023-08-26T00:58:03.000+09:00",
        },
        {
          "name": "Run deno task bundle",
          "status": "completed",
          "conclusion": "success",
          "number": 4,
          "started_at": "2023-08-26T00:58:04.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
        {
          "name": "Run self action",
          "status": "completed",
          "conclusion": "success",
          "number": 5,
          "started_at": "2023-08-26T00:58:15.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
        {
          "name": "Post Run self action",
          "status": "completed",
          "conclusion": "success",
          "number": 9,
          "started_at": "2023-08-26T00:58:15.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
        {
          "name": "Post Run actions/checkout@v3",
          "status": "completed",
          "conclusion": "success",
          "number": 10,
          "started_at": "2023-08-26T00:58:15.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
        {
          "name": "Complete job",
          "status": "completed",
          "conclusion": "success",
          "number": 11,
          "started_at": "2023-08-26T00:58:15.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
      ],
    }] as unknown as WorkflowJobs;

    // deno-fmt-ignore
    const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
Waiting for a runner (7s) :active, job0-0, 00:00:01, 7s
${workflowJobs[0].steps![0].name} (2s) :job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} (1s) :job0-2, after job0-1, 1s
${workflowJobs[0].steps![2].name} (1s) :job0-3, after job0-2, 1s
${workflowJobs[0].steps![3].name} (11s) :job0-4, after job0-3, 11s
${workflowJobs[0].steps![4].name} (0s) :job0-5, after job0-4, 0s
${workflowJobs[0].steps![5].name} (0s) :job0-6, after job0-5, 0s
${workflowJobs[0].steps![6].name} (0s) :job0-7, after job0-6, 0s
${workflowJobs[0].steps![7].name} (0s) :job0-8, after job0-7, 0s
\`\`\`
`;

    assertEquals(createGantt(workflow, workflowJobs), expect);
  });

  await t.step("job has skipped and failure steps", () => {
    const workflow = {
      "id": 5977929222,
      "name": "POC",
      "run_number": 5,
      "event": "push",
      "status": "completed",
      "conclusion": "failure",
      "workflow_id": 66989622,
      "created_at": "2023-08-25T15:57:51Z",
      "updated_at": "2023-08-25T15:58:19Z",
      "run_started_at": "2023-08-25T15:57:51Z",
    } as unknown as Workflow;

    const workflowJobs = [{
      "id": 16218974194,
      "run_id": 5977929222,
      "workflow_name": "POC",
      "status": "completed",
      "conclusion": "failure",
      "created_at": "2023-08-25T15:57:52Z",
      "started_at": "2023-08-25T15:57:59Z",
      "completed_at": "2023-08-25T15:58:17Z",
      "name": "run_self",
      "steps": [
        {
          "name": "Set up job",
          "status": "completed",
          "conclusion": "skipped",
          "number": 1,
          "started_at": "2023-08-26T00:57:58.000+09:00",
          "completed_at": "2023-08-26T00:58:00.000+09:00",
        },
        {
          "name": "Run actions/checkout@v3",
          "status": "completed",
          "conclusion": "failure",
          "number": 2,
          "started_at": "2023-08-26T00:58:00.000+09:00",
          "completed_at": "2023-08-26T00:58:01.000+09:00",
        },
        {
          "name": "Post Run actions/checkout@v3",
          "status": "completed",
          "conclusion": "success",
          "number": 10,
          "started_at": "2023-08-26T00:58:15.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
        {
          "name": "Complete job",
          "status": "completed",
          "conclusion": "success",
          "number": 11,
          "started_at": "2023-08-26T00:58:15.000+09:00",
          "completed_at": "2023-08-26T00:58:15.000+09:00",
        },
      ],
    }] as unknown as WorkflowJobs;

    // deno-fmt-ignore
    const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
Waiting for a runner (7s) :active, job0-0, 00:00:01, 7s
${workflowJobs[0].steps![0].name} (2s) :done, job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} (1s) :crit, job0-2, after job0-1, 1s
${workflowJobs[0].steps![2].name} (0s) :job0-3, after job0-2, 0s
${workflowJobs[0].steps![3].name} (0s) :job0-4, after job0-3, 0s
\`\`\`
`;

    assertEquals(createGantt(workflow, workflowJobs), expect);
  });

  await t.step("Hide not completed steps", () => {
    const workflow = {
      "id": 6290960492,
      "name": "CI",
      "run_number": 53,
      "event": "pull_request",
      "status": "in_progress",
      "conclusion": null,
      "created_at": "2023-09-24T15:41:23Z",
      "updated_at": "2023-09-24T15:46:01Z",
      "run_started_at": "2023-09-24T15:41:23Z",
    } as unknown as Workflow;

    const workflowJobs = [{
      "id": 17078901763,
      "run_id": 6290960492,
      "workflow_name": "CI",
      "status": "in_progress",
      "conclusion": null,
      "created_at": "2023-09-24T15:45:54Z",
      "started_at": "2023-09-24T15:46:00Z",
      "completed_at": null,
      "name": "run_self",
      "steps": [
        {
          "name": "Set up job",
          "status": "completed",
          "conclusion": "success",
          "number": 1,
          "started_at": "2023-09-24T15:46:00.000Z",
          "completed_at": "2023-09-24T15:46:01.000Z",
        },
        {
          "name": "Download bundled dist",
          "status": "in_progress",
          "conclusion": null,
          "number": 2,
          "started_at": "2023-09-24T15:46:01.000Z",
          "completed_at": null,
        },
        {
          "name": "Run self action",
          "status": "queued",
          "conclusion": null,
          "number": 3,
          "started_at": null,
          "completed_at": null,
        },
      ],
    }] as unknown as WorkflowJobs;

    // deno-fmt-ignore
    const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
Waiting for a runner (6s) :active, job0-0, 00:04:31, 6s
${workflowJobs[0].steps![0].name} (1s) :job0-1, after job0-0, 1s
\`\`\`
`;

    assertEquals(createGantt(workflow, workflowJobs), expect);
  });
});

Deno.test("2 section gantt", async (t) => {
  await t.step("all steps are success", () => {
    const workflow = {
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
\`\`\`
`;

    assertEquals(createGantt(workflow, workflowJobs), expect);
  });

  await t.step("Hide skipped jobs", () => {
    const workflow = {
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
\`\`\`
`;

    assertEquals(createGantt(workflow, workflowJobs), expect);
  });
});

Deno.test("Special case gantt", async (t) => {
  await t.step(
    "Escape colon char in job name or step name",
    () => {
      const workflow = {
        "id": 6301810753,
        "name": "CI",
        "run_number": 60,
        "event": "pull_request",
        "status": "in_progress",
        "conclusion": null,
        "workflow_id": 69674074,
        "created_at": "2023-09-25T15:55:47Z",
        "updated_at": "2023-09-25T15:57:36Z",
        "run_started_at": "2023-09-25T15:55:47Z",
      } as unknown as Workflow;

      const workflowJobs = [{
        "id": 17107722147,
        "run_id": 6301810753,
        "workflow_name": "CI",
        "status": "completed",
        "conclusion": "success",
        "created_at": "2023-09-25T15:55:50Z",
        "started_at": "2023-09-25T15:55:56Z",
        "completed_at": "2023-09-25T15:56:06Z",
        "name": "check: deno 1.36.1",
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1,
            "started_at": "2023-09-25T15:55:56.000Z",
            "completed_at": "2023-09-25T15:55:57.000Z",
          },
          {
            "name": "check: deno",
            "status": "completed",
            "conclusion": "success",
            "number": 2,
            "started_at": "2023-09-25T15:55:57.000Z",
            "completed_at": "2023-09-25T15:55:58.000Z",
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 3,
            "started_at": "2023-09-25T15:56:03.000Z",
            "completed_at": "2023-09-25T15:56:03.000Z",
          },
        ],
      }] as unknown as WorkflowJobs;

      const expectJobName = "check deno 1.36.1";
      const expectStepName = "check deno";
      // deno-fmt-ignore
      const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${expectJobName}
Waiting for a runner (6s) :active, job0-0, 00:00:03, 6s
${workflowJobs[0].steps![0].name} (1s) :job0-1, after job0-0, 1s
${expectStepName} (1s) :job0-2, after job0-1, 1s
${workflowJobs[0].steps![2].name} (0s) :job0-3, after job0-2, 0s
\`\`\`
`;

      assertEquals(createGantt(workflow, workflowJobs), expect);
    },
  );
  await t.step("Retried job", () => {
    const workflow = {
      "id": 5833450919,
      "name": "Check self-hosted runner",
      "run_number": 128,
      "event": "workflow_dispatch",
      "status": "completed",
      "conclusion": "success",
      "workflow_id": 10970418,
      // Retried job does not changed created_at but changed run_started_at.
      // This dummy simulate to retry job after 1 hour.
      "created_at": "2023-08-11T13:00:48Z",
      "updated_at": "2023-08-11T14:01:56Z",
      "run_started_at": "2023-08-11T14:00:48Z",
      "run_attempt": 2,
    } as unknown as Workflow;

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
\`\`\`
`;

    assertEquals(createGantt(workflow, workflowJobs), expect);
  });

  await t.step(
    "'Waiting for a runner' step duration is ommited if workflow_job has not 'created_at' field (< GHES v3.9)",
    () => {
      const workflow = {
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

      const workflowJobs = [
        {
          "id": 15820938470,
          "run_id": 5833450919,
          "workflow_name": "Check self-hosted runner",
          "status": "completed",
          "conclusion": "success",
          // "created_at" field is not exists before GHES v3.9.
          // GHES v3.8 https://docs.github.com/en/enterprise-server@3.8/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
          // GHES v3.9 https://docs.github.com/en/enterprise-server@3.9/rest/actions/workflow-jobs?apiVersion=2022-11-28#list-jobs-for-a-workflow-run-attempt
          // To emulate < GHES v3.9, just comment out this fixture.
          // "created_at": "2023-08-11T14:00:50Z",
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
      ] as unknown as WorkflowJobs;

      // deno-fmt-ignore
      const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
Waiting for a runner (not supported < GHES v3.9) :active, job0-0, 00:00:43, 1s
${workflowJobs[0].steps![0].name} (2s) :job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} (0s) :job0-2, after job0-1, 0s
${workflowJobs[0].steps![2].name} (0s) :job0-3, after job0-2, 0s
\`\`\`
`;

      assertEquals(createGantt(workflow, workflowJobs), expect);
    },
  );
});

Deno.test("formatStep", async (t) => {
  const baseStep: ganttStep = {
    name: "Test step",
    id: "job0-1",
    status: "",
    position: "after job0-0",
    sec: 1,
  };

  await t.step("status:empty", () => {
    const step: ganttStep = { ...baseStep, status: "" };
    const actual = formatStep(step);
    const expect = `${step.name} :${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.step("status:done", () => {
    const step: ganttStep = { ...baseStep, status: "done" };
    const actual = formatStep(step);
    const expect =
      `${step.name} :done, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.step("status:crit", () => {
    const step: ganttStep = { ...baseStep, status: "crit" };
    const actual = formatStep(step);
    const expect =
      `${step.name} :crit, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.step("status:active", () => {
    const step: ganttStep = { ...baseStep, status: "active" };
    const actual = formatStep(step);
    const expect =
      `${step.name} :active, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
});

Deno.test("formatShortElapsedTime", async (t) => {
  await t.step("9sec => 9s", () => {
    const elapsedSec = 9;
    assertEquals(formatShortElapsedTime(elapsedSec), `9s`);
  });
  await t.step("59sec => 59s", () => {
    const elapsedSec = 59;
    assertEquals(formatShortElapsedTime(elapsedSec), `59s`);
  });
  await t.step("60sec => 1m0s", () => {
    const elapsedSec = 60;
    assertEquals(formatShortElapsedTime(elapsedSec), `1m0s`);
  });
  await t.step("61sec => 1m1s", () => {
    const elapsedSec = 61;
    assertEquals(formatShortElapsedTime(elapsedSec), `1m1s`);
  });
  await t.step("3600sec => 1h0m0s", () => {
    const elapsedSec = 60 * 60; // 1hour
    assertEquals(formatShortElapsedTime(elapsedSec), `1h0m0s`);
  });
  await t.step("3660sec => 1h1m0s", () => {
    const elapsedSec = 60 * 60 + 60; // 1hour 1min
    assertEquals(formatShortElapsedTime(elapsedSec), `1h1m0s`);
  });
  await t.step("3661sec => 1h1m1s", () => {
    const elapsedSec = 60 * 60 + 60 + 1; // 1hour 1min 1sec
    assertEquals(formatShortElapsedTime(elapsedSec), `1h1m1s`);
  });
});
