import { assertEquals } from "@std/assert";
import {
  createGanttDiagrams,
  createGanttJobs,
  createMermaid,
} from "../src/workflow_gantt.ts";
import { formatSection } from "../src/format_util.ts";
import { WorkflowJobs, WorkflowRun } from "@kesin11/gha-utils";

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
} as unknown as WorkflowRun;

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
      } as unknown as WorkflowRun;

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
\`\`\``;

      assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
    },
  );

  await t.step("Retried job", () => {
    const workflow = {
      ...commonWorkflow,
      // Retried job does not changed created_at but changed run_started_at.
      // This dummy simulate to retry job after 1 hour.
      "created_at": "2023-08-11T13:00:48Z",
      "updated_at": "2023-08-11T14:01:56Z",
      "run_started_at": "2023-08-11T14:00:48Z",
      "run_attempt": 2,
    };

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
\`\`\``;

    assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
  });

  await t.step(
    "'Waiting for a runner' step duration is ommited if workflow_job has not 'created_at' field (< GHES v3.9)",
    () => {
      const workflow = { ...commonWorkflow };
      const workflowJobs = [
        {
          "id": 15820938470,
          "run_id": 5833450919,
          "workflow_name": "Check self-hosted runner",
          "status": "completed",
          "conclusion": "success",
          // "created_at" field does not exists before GHES v3.9.
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
${workflowJobs[0].steps![0].name} (2s) :job0-0, 00:00:43, 2s
${workflowJobs[0].steps![1].name} (0s) :job0-1, after job0-0, 0s
${workflowJobs[0].steps![2].name} (0s) :job0-2, after job0-1, 0s
\`\`\``;

      assertEquals(createMermaid(workflow, workflowJobs, {}), expect);
    },
  );

  await t.step(
    "'Waiting for a runner' step duration is ommited if option 'showWaitingRunner' === false ",
    () => {
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
      ] as unknown as WorkflowJobs;

      // deno-fmt-ignore
      const expect = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[0].name}
${workflowJobs[0].steps![0].name} (2s) :job0-0, 00:00:43, 2s
${workflowJobs[0].steps![1].name} (0s) :job0-1, after job0-0, 0s
${workflowJobs[0].steps![2].name} (0s) :job0-2, after job0-1, 0s
\`\`\``;

      assertEquals(
        createMermaid(workflow, workflowJobs, { showWaitingRunner: false }),
        expect,
      );
    },
  );

  await t.step(
    "Split gantt when generated gantt characters reached max limit of mermaid.js",
    () => {
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
              "name": "Complete runner",
              "status": "completed",
              "conclusion": "success",
              "number": 3,
              "started_at": "2023-08-11T23:01:36.000+09:00",
              "completed_at": "2023-08-11T23:01:36.000+09:00",
            },
            {
              "name": "Complete job",
              "status": "completed",
              "conclusion": "success",
              "number": 4,
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
              "name": "Complete runner",
              "status": "completed",
              "conclusion": "success",
              "number": 3,
              "started_at": "2023-08-11T23:01:50.000+09:00",
              "completed_at": "2023-08-11T23:01:50.000+09:00",
            },
            {
              "name": "Complete job",
              "status": "completed",
              "conclusion": "success",
              "number": 4,
              "started_at": "2023-08-11T23:01:49.000+09:00",
              "completed_at": "2023-08-11T23:01:49.000+09:00",
            },
          ],
        },
      ] as unknown as WorkflowJobs;

      // deno-fmt-ignore
      const mermaid1 = `
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
\`\`\``

      // deno-fmt-ignore
      const mermaid2 = `
\`\`\`mermaid
gantt
title ${workflowJobs[0].workflow_name}
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section ${workflowJobs[1].name}
Waiting for a runner (39s) :active, job1-0, 00:00:03, 39s
${workflowJobs[1].steps![0].name} (3s) :job1-1, after job1-0, 3s
${workflowJobs[1].steps![1].name} (0s) :job1-2, after job1-1, 0s
${workflowJobs[1].steps![2].name} (0s) :job1-3, after job1-2, 0s
${workflowJobs[1].steps![3].name} (0s) :job1-4, after job1-3, 0s
\`\`\``;
      const expect = [mermaid1, mermaid2];

      const title = workflow.name ?? "";
      const ganttJobs = createGanttJobs(workflow, workflowJobs);
      const maxCharForTest = mermaid1.length;
      const actual = createGanttDiagrams(title, ganttJobs, maxCharForTest);

      assertEquals(actual, expect);
    },
  );

  await t.step(
    "Newline characters properly counted in split gantt calculation (issue #222)",
    () => {
      const workflow = { ...commonWorkflow };
      const workflowJobs = [
        {
          "id": 1,
          "run_id": 5833450919,
          "workflow_name": "Test",
          "status": "completed",
          "conclusion": "success",
          "created_at": "2023-08-11T14:00:50Z",
          "started_at": "2023-08-11T14:01:31Z",
          "completed_at": "2023-08-11T14:01:36Z",
          "name": "a",
          "steps": [
            {
              "name": "x",
              "status": "completed",
              "conclusion": "success",
              "number": 1,
              "started_at": "2023-08-11T23:01:30.000+09:00",
              "completed_at": "2023-08-11T23:01:32.000+09:00",
            },
          ],
        },
        {
          "id": 2,
          "run_id": 5833450919,
          "workflow_name": "Test",
          "status": "completed",
          "conclusion": "success",
          "created_at": "2023-08-11T14:00:51Z",
          "started_at": "2023-08-11T14:01:30Z",
          "completed_at": "2023-08-11T14:01:50Z",
          "name": "b",
          "steps": [
            {
              "name": "y",
              "status": "completed",
              "conclusion": "success",
              "number": 1,
              "started_at": "2023-08-11T23:01:29.000+09:00",
              "completed_at": "2023-08-11T23:01:32.000+09:00",
            },
          ],
        },
      ] as unknown as WorkflowJobs;

      const title = workflow.name ?? "";
      const ganttJobs = createGanttJobs(workflow, workflowJobs);

      const header = `
\`\`\`mermaid
gantt
title Check self-hosted runner
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
`;
      const footer = "\n\`\`\`";
      const headerFooterLength = header.length + footer.length;

      const section1 = formatSection(ganttJobs[0]);
      const section2 = formatSection(ganttJobs[1]);

      // Set maxChar to be just less than the total including newlines
      // This should now properly trigger splitting
      const totalWithNewlines = headerFooterLength + section1.length + 1 +
        section2.length;
      const maxCharForTest = totalWithNewlines - 5; // A bit less to trigger split

      const result = createGanttDiagrams(title, ganttJobs, maxCharForTest);

      assertEquals(
        result.length,
        2,
        "Properly splits when including newline calculations",
      );

      // Each diagram should be within the limit
      assertEquals(
        result[0].length <= maxCharForTest,
        true,
        "First diagram within limit",
      );
      assertEquals(
        result[1].length <= maxCharForTest,
        true,
        "Second diagram within limit",
      );
    },
  );
});
