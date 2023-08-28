import { assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";
import { createGantt, Workflow, WorkflowJobs } from "../workflow_gantt.ts";

Deno.test("workflow", () => {
  // const workflow = await fetchWorkflow("kesin11", "actions-timeline", 5977929222);
  // const workflowJob = await fetchWorkflowRunJobs("kesin11", "actions-timeline", 5977929222);
  // console.log(JSON.stringify(workflow, null , 2));
  // console.log(JSON.stringify(workflowJob, null , 2));

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
${workflowJobs[0].steps![0].name} :job0-0, 00:00:08, 2s
${workflowJobs[0].steps![1].name} :job0-1, after job0-0, 1s
${workflowJobs[0].steps![2].name} :job0-2, after job0-1, 1s
${workflowJobs[0].steps![3].name} :job0-3, after job0-2, 11s
${workflowJobs[0].steps![4].name} :job0-4, after job0-3, 0s
${workflowJobs[0].steps![5].name} :job0-5, after job0-4, 0s
${workflowJobs[0].steps![6].name} :job0-6, after job0-5, 0s
${workflowJobs[0].steps![7].name} :job0-7, after job0-6, 0s
\`\`\`
`;

  assertEquals(createGantt(workflow, workflowJobs), expect);
});
