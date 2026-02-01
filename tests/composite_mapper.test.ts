import { assertEquals } from "@std/assert";
import {
  createCompositeStepLookup,
  filterNestedCompositeBlocks,
  findRepoLocalCompositeSteps,
  isRepoLocalCompositeStep,
} from "../src/composite_mapper.ts";
import type { CompositeActionStep } from "../src/types.ts";
import type { WorkflowJobs } from "@kesin11/gha-utils";
import type { LogBlock } from "../src/log_parser.ts";

Deno.test("isRepoLocalCompositeStep", async (t) => {
  await t.step("should return true for repo-local composite step", () => {
    const result = isRepoLocalCompositeStep(
      "Run ./.github/actions/setup-deno-with-cache",
    );
    assertEquals(result, true);
  });

  await t.step("should return false for external action", () => {
    const result = isRepoLocalCompositeStep("Run actions/checkout@v4");
    assertEquals(result, false);
  });

  await t.step("should return false for regular step", () => {
    const result = isRepoLocalCompositeStep("Run npm install");
    assertEquals(result, false);
  });
});

Deno.test("findRepoLocalCompositeSteps", async (t) => {
  await t.step("should find composite steps in jobs", () => {
    const workflowJobs: WorkflowJobs = [
      {
        id: 123,
        name: "test-job",
        status: "completed",
        conclusion: "success",
        run_id: 1,
        started_at: "2024-01-15T10:30:00Z",
        completed_at: "2024-01-15T10:35:00Z",
        steps: [
          {
            name: "Set up job",
            number: 1,
            status: "completed",
            conclusion: "success",
            started_at: "2024-01-15T10:30:00Z",
            completed_at: "2024-01-15T10:30:01Z",
          },
          {
            name: "Run ./.github/actions/setup-deno-with-cache",
            number: 2,
            status: "completed",
            conclusion: "success",
            started_at: "2024-01-15T10:30:01Z",
            completed_at: "2024-01-15T10:30:10Z",
          },
          {
            name: "Run tests",
            number: 3,
            status: "completed",
            conclusion: "success",
            started_at: "2024-01-15T10:30:10Z",
            completed_at: "2024-01-15T10:35:00Z",
          },
        ],
      } as WorkflowJobs[0],
    ];

    const result = findRepoLocalCompositeSteps(workflowJobs);
    assertEquals(result.size, 1);
    assertEquals(result.get(123), [2]);
  });

  await t.step(
    "should return empty map for jobs without composite steps",
    () => {
      const workflowJobs: WorkflowJobs = [
        {
          id: 123,
          name: "test-job",
          status: "completed",
          conclusion: "success",
          run_id: 1,
          started_at: "2024-01-15T10:30:00Z",
          completed_at: "2024-01-15T10:35:00Z",
          steps: [
            {
              name: "Run actions/checkout@v4",
              number: 1,
              status: "completed",
              conclusion: "success",
              started_at: "2024-01-15T10:30:00Z",
              completed_at: "2024-01-15T10:30:01Z",
            },
          ],
        } as WorkflowJobs[0],
      ];

      const result = findRepoLocalCompositeSteps(workflowJobs);
      assertEquals(result.size, 0);
    },
  );
});

Deno.test("createCompositeStepLookup", async (t) => {
  await t.step("should create lookup from composite steps map", () => {
    const compositeStepsMap = new Map<number, CompositeActionStep[]>();
    compositeStepsMap.set(123, [
      {
        parentStepName: "./.github/actions/setup-deno-with-cache",
        parentStepNumber: 2,
        innerSteps: [
          {
            name: "denoland/setup-deno@v1",
            startedAt: new Date("2024-01-15T10:30:01.000Z"),
            completedAt: new Date("2024-01-15T10:30:03.000Z"),
          },
        ],
      },
    ]);

    const lookup = createCompositeStepLookup(compositeStepsMap);
    assertEquals(lookup.size, 1);
    const composite = lookup.get("123-2");
    assertEquals(
      composite?.parentStepName,
      "./.github/actions/setup-deno-with-cache",
    );
    assertEquals(composite?.innerSteps.length, 1);
  });
});

Deno.test("filterNestedCompositeBlocks", async (t) => {
  await t.step("should return empty array for empty input", () => {
    const result = filterNestedCompositeBlocks([]);
    assertEquals(result, []);
  });

  await t.step("should return single block as-is", () => {
    const blocks: LogBlock[] = [
      {
        name: "./.github/actions/setup",
        startedAt: new Date("2024-01-15T10:30:00.000Z"),
        completedAt: new Date("2024-01-15T10:31:00.000Z"),
      },
    ];
    const result = filterNestedCompositeBlocks(blocks);
    assertEquals(result.length, 1);
    assertEquals(result[0].name, "./.github/actions/setup");
  });

  await t.step("should keep all top-level composites with no nesting", () => {
    const blocks: LogBlock[] = [
      {
        name: "./.github/actions/action-a",
        startedAt: new Date("2024-01-15T10:30:00.000Z"),
        completedAt: new Date("2024-01-15T10:31:00.000Z"),
      },
      {
        name: "./.github/actions/action-b",
        startedAt: new Date("2024-01-15T10:32:00.000Z"),
        completedAt: new Date("2024-01-15T10:33:00.000Z"),
      },
    ];
    const result = filterNestedCompositeBlocks(blocks);
    assertEquals(result.length, 2);
    assertEquals(result[0].name, "./.github/actions/action-a");
    assertEquals(result[1].name, "./.github/actions/action-b");
  });

  await t.step("should filter out nested composite actions", () => {
    // Simulating gemini-cli case:
    // publish-release (02:38:19 - 02:44:28)
    //   └── npm-auth-token (02:39:07) - nested
    //   └── npm-auth-token (02:39:21) - nested
    //   └── verify-release (02:39:38) - nested
    const blocks: LogBlock[] = [
      {
        name: "./.github/actions/publish-release",
        startedAt: new Date("2024-01-15T10:38:19.000Z"),
        completedAt: new Date("2024-01-15T10:44:28.000Z"),
      },
      {
        name: "./.github/actions/npm-auth-token",
        startedAt: new Date("2024-01-15T10:39:07.000Z"),
        completedAt: new Date("2024-01-15T10:39:10.000Z"),
      },
      {
        name: "./.github/actions/npm-auth-token",
        startedAt: new Date("2024-01-15T10:39:21.000Z"),
        completedAt: new Date("2024-01-15T10:39:25.000Z"),
      },
      {
        name: "./.github/actions/verify-release",
        startedAt: new Date("2024-01-15T10:39:38.000Z"),
        completedAt: new Date("2024-01-15T10:40:00.000Z"),
      },
    ];
    const result = filterNestedCompositeBlocks(blocks);
    assertEquals(result.length, 1);
    assertEquals(result[0].name, "./.github/actions/publish-release");
  });

  await t.step("should keep composite after parent ends", () => {
    // publish-release ends, then create-pull-request starts
    const blocks: LogBlock[] = [
      {
        name: "./.github/actions/publish-release",
        startedAt: new Date("2024-01-15T10:38:19.000Z"),
        completedAt: new Date("2024-01-15T10:44:28.000Z"),
      },
      {
        name: "./.github/actions/npm-auth-token",
        startedAt: new Date("2024-01-15T10:39:07.000Z"),
        completedAt: new Date("2024-01-15T10:39:10.000Z"),
      },
      {
        name: "./.github/actions/create-pull-request",
        startedAt: new Date("2024-01-15T10:44:41.000Z"),
        completedAt: new Date("2024-01-15T10:45:00.000Z"),
      },
    ];
    const result = filterNestedCompositeBlocks(blocks);
    assertEquals(result.length, 2);
    assertEquals(result[0].name, "./.github/actions/publish-release");
    assertEquals(result[1].name, "./.github/actions/create-pull-request");
  });

  await t.step("should handle multiple levels of nesting", () => {
    // publish-release > tag-npm-release > setup-npmrc > npm-auth-token
    const blocks: LogBlock[] = [
      {
        name: "./.github/actions/publish-release",
        startedAt: new Date("2024-01-15T10:38:19.000Z"),
        completedAt: new Date("2024-01-15T10:44:28.000Z"),
      },
      {
        name: "./.github/actions/tag-npm-release",
        startedAt: new Date("2024-01-15T10:40:00.000Z"),
        completedAt: new Date("2024-01-15T10:43:00.000Z"),
      },
      {
        name: "./.github/actions/setup-npmrc",
        startedAt: new Date("2024-01-15T10:40:30.000Z"),
        completedAt: new Date("2024-01-15T10:41:00.000Z"),
      },
      {
        name: "./.github/actions/npm-auth-token",
        startedAt: new Date("2024-01-15T10:40:35.000Z"),
        completedAt: new Date("2024-01-15T10:40:40.000Z"),
      },
    ];
    const result = filterNestedCompositeBlocks(blocks);
    assertEquals(result.length, 1);
    assertEquals(result[0].name, "./.github/actions/publish-release");
  });
});
