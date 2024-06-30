import { assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";
import { createMermaid } from "../src/workflow_gantt.ts";
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
\`\`\``;

    assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
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
\`\`\``;

    assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
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
\`\`\``;

    assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
  });
});
