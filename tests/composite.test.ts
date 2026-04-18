import { encodeBase64 } from "@std/encoding";
import { assertEquals } from "@std/assert";
import {
  FileContent,
  type FileContentResponse,
  type WorkflowJobs,
  WorkflowModel,
} from "@kesin11/gha-utils";
import {
  type CompositeStepInfo,
  expandJobSteps,
  extractSubSteps,
  identifyCompositeSteps,
  parseLogBlocks,
} from "../src/composite.ts";
import type { TimelineStep } from "../src/types.ts";

function makeWorkflowModel(yamlContent: string): WorkflowModel {
  const fileContentResponse: FileContentResponse = {
    type: "file",
    size: yamlContent.length,
    name: "workflow.yml",
    path: ".github/workflows/workflow.yml",
    content: encodeBase64(yamlContent),
    sha: "abc123",
    url:
      "https://api.github.com/repos/owner/repo/contents/.github/workflows/workflow.yml",
    git_url: null,
    html_url: null,
    download_url: null,
  };
  return new WorkflowModel(new FileContent(fileContentResponse));
}

const COMPOSITE_WORKFLOW_YAML = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/setup
      - run: echo hello
`;

function makeWorkflowJobs(
  startedAt: string | null,
  completedAt: string | null,
): WorkflowJobs {
  return [{
    id: 1,
    name: "test",
    steps: [{
      name: "Run ./.github/actions/setup",
      status: "completed",
      conclusion: "success",
      number: 1,
      started_at: startedAt,
      completed_at: completedAt,
    }],
  }] as unknown as WorkflowJobs;
}

Deno.test(identifyCompositeSteps.name, async (t) => {
  const workflowModel = makeWorkflowModel(COMPOSITE_WORKFLOW_YAML);
  const thresholdSec = 20;

  await t.step("includes step with duration at threshold", () => {
    const durationMs = thresholdSec * 1000;
    const startedAt = "2024-01-15T10:00:00.000Z";
    const completedAt = new Date(
      new Date(startedAt).getTime() + durationMs,
    ).toISOString();
    const workflowJobs = makeWorkflowJobs(startedAt, completedAt);

    const result = identifyCompositeSteps(
      workflowJobs,
      workflowModel,
      thresholdSec,
    );
    assertEquals(result.size, 1);
    assertEquals(result.get(1)?.length, 1);
    assertEquals(result.get(1)?.[0].usesPath, "./.github/actions/setup");
  });

  await t.step("includes step with duration above threshold", () => {
    const startedAt = "2024-01-15T10:00:00.000Z";
    const completedAt = "2024-01-15T10:01:00.000Z"; // 60 seconds
    const workflowJobs = makeWorkflowJobs(startedAt, completedAt);

    const result = identifyCompositeSteps(
      workflowJobs,
      workflowModel,
      thresholdSec,
    );
    assertEquals(result.size, 1);
  });

  await t.step("excludes step with duration below threshold", () => {
    const durationMs = (thresholdSec - 1) * 1000; // 19 seconds
    const startedAt = "2024-01-15T10:00:00.000Z";
    const completedAt = new Date(
      new Date(startedAt).getTime() + durationMs,
    ).toISOString();
    const workflowJobs = makeWorkflowJobs(startedAt, completedAt);

    const result = identifyCompositeSteps(
      workflowJobs,
      workflowModel,
      thresholdSec,
    );
    assertEquals(result.size, 0);
  });

  await t.step(
    "excludes step with missing timestamps (defaults to 0 duration)",
    () => {
      const workflowJobs = makeWorkflowJobs(null, null);

      const result = identifyCompositeSteps(
        workflowJobs,
        workflowModel,
        thresholdSec,
      );
      assertEquals(result.size, 0);
    },
  );
});

Deno.test(parseLogBlocks.name, async (t) => {
  await t.step("extracts ##[group] blocks with timestamps", () => {
    const logText =
      `2024-01-15T10:00:00.0000000Z ##[group]Run ./.github/actions/setup
2024-01-15T10:00:00.1000000Z Some log line
2024-01-15T10:00:01.0000000Z ##[endgroup]
2024-01-15T10:00:01.0000000Z ##[group]Run echo "hello"
2024-01-15T10:00:01.5000000Z hello
2024-01-15T10:00:02.0000000Z ##[endgroup]
2024-01-15T10:00:02.0000000Z ##[group]Run npm install
2024-01-15T10:00:05.0000000Z ##[endgroup]`;

    const blocks = parseLogBlocks(logText);
    assertEquals(blocks, [
      {
        name: "Run ./.github/actions/setup",
        startedAt: new Date("2024-01-15T10:00:00.000Z"),
      },
      {
        name: 'Run echo "hello"',
        startedAt: new Date("2024-01-15T10:00:01.000Z"),
      },
      {
        name: "Run npm install",
        startedAt: new Date("2024-01-15T10:00:02.000Z"),
      },
    ]);
  });

  await t.step("returns empty array for log without groups", () => {
    const logText = `2024-01-15T10:00:00.0000000Z Some log line
2024-01-15T10:00:01.0000000Z Another log line`;
    const blocks = parseLogBlocks(logText);
    assertEquals(blocks, []);
  });

  await t.step("returns empty array for empty log", () => {
    const blocks = parseLogBlocks("");
    assertEquals(blocks, []);
  });
});

Deno.test(extractSubSteps.name, async (t) => {
  const logBlocks = [
    // Blocks outside composite range (before)
    {
      name: "Run actions/checkout@v4",
      startedAt: new Date("2024-01-15T10:00:00Z"),
    },
    // Composite header
    {
      name: "Run ./.github/actions/setup",
      startedAt: new Date("2024-01-15T10:00:05Z"),
    },
    // Sub-steps inside composite (3 primary "Run " blocks)
    { name: "Run echo step1", startedAt: new Date("2024-01-15T10:00:06Z") },
    { name: "Run npm install", startedAt: new Date("2024-01-15T10:00:07Z") },
    { name: "Run npm run build", startedAt: new Date("2024-01-15T10:00:10Z") },
    // Block outside composite range (after)
    { name: "Run echo done", startedAt: new Date("2024-01-15T10:00:20Z") },
  ];

  await t.step("extracts sub-steps using expectedStepCount", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "success",
      "./.github/actions/setup",
      3, // expectedStepCount
    );

    assertEquals(subSteps, [
      {
        name: "echo step1",
        started_at: "2024-01-15T10:00:06.000Z",
        completed_at: "2024-01-15T10:00:07.000Z",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "npm install",
        started_at: "2024-01-15T10:00:07.000Z",
        completed_at: "2024-01-15T10:00:10.000Z",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "npm run build",
        started_at: "2024-01-15T10:00:10.000Z",
        completed_at: "2024-01-15T10:00:15Z",
        status: "completed",
        conclusion: "success",
      },
    ]);
  });

  await t.step("does not include blocks beyond expectedStepCount", () => {
    // Only request 2 of the 3 available sub-steps
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "success",
      "./.github/actions/setup",
      2, // Only 2 steps
    );

    assertEquals(subSteps, [
      {
        name: "echo step1",
        started_at: "2024-01-15T10:00:06.000Z",
        completed_at: "2024-01-15T10:00:07.000Z",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "npm install",
        started_at: "2024-01-15T10:00:07.000Z",
        completed_at: "2024-01-15T10:00:15Z",
        status: "completed",
        conclusion: "success",
      },
    ]);
  });

  await t.step("inherits status and conclusion from composite step", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "failure",
      "./.github/actions/setup",
      3,
    );

    assertEquals(subSteps, [
      {
        name: "echo step1",
        started_at: "2024-01-15T10:00:06.000Z",
        completed_at: "2024-01-15T10:00:07.000Z",
        status: "completed",
        conclusion: "failure",
      },
      {
        name: "npm install",
        started_at: "2024-01-15T10:00:07.000Z",
        completed_at: "2024-01-15T10:00:10.000Z",
        status: "completed",
        conclusion: "failure",
      },
      {
        name: "npm run build",
        started_at: "2024-01-15T10:00:10.000Z",
        completed_at: "2024-01-15T10:00:15Z",
        status: "completed",
        conclusion: "failure",
      },
    ]);
  });

  await t.step("returns empty for no header match in range", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T11:00:00Z",
      "2024-01-15T11:00:10Z",
      "completed",
      "success",
      "./.github/actions/setup",
      3,
    );
    assertEquals(subSteps, []);
  });

  await t.step(
    "includes auxiliary blocks from uses actions (e.g. Environment details)",
    () => {
      // Simulates: composite has 2 steps (setup-deno, setup-node),
      // but setup-node emits an extra "Environment details" block
      const msBlocks = [
        {
          name: "Run ./.github/actions/setup",
          startedAt: new Date("2024-01-15T10:00:05.100Z"),
        },
        {
          name: "Run denoland/setup-deno@v1",
          startedAt: new Date("2024-01-15T10:00:05.200Z"),
        },
        {
          name: "Run actions/setup-node@v6",
          startedAt: new Date("2024-01-15T10:00:10.500Z"),
        },
        {
          name: "Environment details",
          startedAt: new Date("2024-01-15T10:00:10.700Z"),
        },
        // Block from next API step (should NOT be included)
        {
          name: "Run deno fmt",
          startedAt: new Date("2024-01-15T10:00:12.000Z"),
        },
      ];

      const subSteps = extractSubSteps(
        msBlocks,
        "2024-01-15T10:00:05Z",
        "2024-01-15T10:00:10Z", // API completed_at (truncated, before actual end)
        "completed",
        "success",
        "./.github/actions/setup",
        2, // 2 YAML steps, but 3 log blocks (Environment details is auxiliary)
      );

      assertEquals(subSteps, [
        {
          name: "denoland/setup-deno@v1",
          started_at: "2024-01-15T10:00:05.200Z",
          completed_at: "2024-01-15T10:00:10.500Z",
          status: "completed",
          conclusion: "success",
        },
        {
          name: "actions/setup-node@v6",
          started_at: "2024-01-15T10:00:10.500Z",
          completed_at: "2024-01-15T10:00:10.700Z",
          status: "completed",
          conclusion: "success",
        },
        {
          name: "Environment details",
          started_at: "2024-01-15T10:00:10.700Z",
          // startedAt 10.700 > compositeCompletedAt 10.000, so use startedAt
          completed_at: "2024-01-15T10:00:10.700Z",
          status: "completed",
          conclusion: "success",
        },
      ]);
    },
  );
});

Deno.test(expandJobSteps.name, () => {
  const compositeStep: TimelineStep = {
    name: "Run ./.github/actions/setup",
    status: "completed",
    conclusion: "success",
    number: 2,
    started_at: "2024-01-15T10:00:05Z",
    completed_at: "2024-01-15T10:00:15Z",
  };
  const normalStep: TimelineStep = {
    name: "Run deno test",
    status: "completed",
    conclusion: "success",
    number: 3,
    started_at: "2024-01-15T10:00:15Z",
    completed_at: "2024-01-15T10:00:18Z",
  };
  const steps = [compositeStep, normalStep] as NonNullable<
    WorkflowJobs[0]["steps"]
  >;
  const compositeInfos: CompositeStepInfo[] = [{
    apiStepIndex: 0,
    apiStepName: compositeStep.name,
    usesPath: "./.github/actions/setup",
    status: compositeStep.status,
    conclusion: compositeStep.conclusion,
  }];
  const compositeStepCounts = new Map([["./.github/actions/setup", 2]]);
  const logBlocks = [
    {
      name: "Run ./.github/actions/setup",
      startedAt: new Date("2024-01-15T10:00:05Z"),
    },
    {
      name: "Run denoland/setup-deno@v1",
      startedAt: new Date("2024-01-15T10:00:06Z"),
    },
    {
      name: "Run actions/setup-node@v6",
      startedAt: new Date("2024-01-15T10:00:10Z"),
    },
  ];

  assertEquals(
    expandJobSteps(steps, compositeInfos, compositeStepCounts, logBlocks),
    [
      compositeStep,
      {
        ...compositeStep,
        name: "(sub) denoland/setup-deno@v1",
        started_at: "2024-01-15T10:00:06.000Z",
        completed_at: "2024-01-15T10:00:10.000Z",
        timelineRowKind: "composite-child",
      },
      {
        ...compositeStep,
        name: "(sub) actions/setup-node@v6",
        started_at: "2024-01-15T10:00:10.000Z",
        completed_at: "2024-01-15T10:00:15Z",
        timelineRowKind: "composite-child",
      },
      normalStep,
    ],
  );
});
