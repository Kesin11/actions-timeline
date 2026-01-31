import { assertEquals } from "@std/assert";
import {
  createCompositeStepLookup,
  findRepoLocalCompositeSteps,
  isRepoLocalCompositeStep,
} from "../src/composite_mapper.ts";
import type { CompositeActionStep } from "../src/types.ts";
import type { WorkflowJobs } from "@kesin11/gha-utils";

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
