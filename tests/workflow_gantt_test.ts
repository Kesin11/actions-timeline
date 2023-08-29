import { assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";
import { createGantt, Workflow, WorkflowJobs } from "../workflow_gantt.ts";

Deno.test("1 section gantt", () => {
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
Waiting for a runner :job0-0, 00:00:01, 7s
${workflowJobs[0].steps![0].name} :job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} :job0-2, after job0-1, 1s
${workflowJobs[0].steps![2].name} :job0-3, after job0-2, 1s
${workflowJobs[0].steps![3].name} :job0-4, after job0-3, 11s
${workflowJobs[0].steps![4].name} :job0-5, after job0-4, 0s
${workflowJobs[0].steps![5].name} :job0-6, after job0-5, 0s
${workflowJobs[0].steps![6].name} :job0-7, after job0-6, 0s
${workflowJobs[0].steps![7].name} :job0-8, after job0-7, 0s
\`\`\`
`;

  assertEquals(createGantt(workflow, workflowJobs), expect);
});

Deno.test("2 section gantt", () => {
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
Waiting for a runner :job0-0, 00:00:02, 41s
${workflowJobs[0].steps![0].name} :job0-1, after job0-0, 2s
${workflowJobs[0].steps![1].name} :job0-2, after job0-1, 0s
${workflowJobs[0].steps![2].name} :job0-3, after job0-2, 0s
${workflowJobs[0].steps![3].name} :job0-4, after job0-3, 0s
${workflowJobs[0].steps![4].name} :job0-5, after job0-4, 0s
${workflowJobs[0].steps![5].name} :job0-6, after job0-5, 0s
${workflowJobs[0].steps![6].name} :job0-7, after job0-6, 0s
${workflowJobs[0].steps![7].name} :job0-8, after job0-7, 0s
section ${workflowJobs[1].name}
Waiting for a runner :job1-0, 00:00:03, 39s
${workflowJobs[1].steps![0].name} :job1-1, after job1-0, 3s
${workflowJobs[1].steps![1].name} :job1-2, after job1-1, 0s
${workflowJobs[1].steps![2].name} :job1-3, after job1-2, 16s
${workflowJobs[1].steps![3].name} :job1-4, after job1-3, 0s
${workflowJobs[1].steps![4].name} :job1-5, after job1-4, 0s
${workflowJobs[1].steps![5].name} :job1-6, after job1-5, 0s
${workflowJobs[1].steps![6].name} :job1-7, after job1-6, 0s
\`\`\`
`;

  assertEquals(createGantt(workflow, workflowJobs), expect);
});
