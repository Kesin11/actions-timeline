import { assertEquals, assertThrows } from "@std/assert";
import { resolveWorkflowRunTarget } from "../src/workflow_run.ts";

const currentRun = {
  owner: "Kesin11",
  repo: "actions-timeline",
  runId: 1000000000,
  runAttempt: 2,
};

Deno.test(resolveWorkflowRunTarget.name, async (t) => {
  await t.step("uses the current run for other events", () => {
    const actual = resolveWorkflowRunTarget(currentRun, {
      eventName: "push",
    });
    assertEquals(actual, currentRun);
  });

  await t.step("uses the completed triggering run", () => {
    const actual = resolveWorkflowRunTarget(currentRun, {
      eventName: "workflow_run",
      action: "completed",
      workflowRun: {
        id: 2000000000,
        runAttempt: 3,
      },
    });
    const expected = {
      owner: "Kesin11",
      repo: "actions-timeline",
      runId: 2000000000,
      runAttempt: 3,
    };
    assertEquals(actual, expected);
  });

  await t.step("defaults the triggering run attempt", () => {
    const actual = resolveWorkflowRunTarget(currentRun, {
      eventName: "workflow_run",
      action: "completed",
      workflowRun: {
        id: 2000000000,
      },
    });
    const expected = {
      owner: "Kesin11",
      repo: "actions-timeline",
      runId: 2000000000,
      runAttempt: 1,
    };
    assertEquals(actual, expected);
  });

  await t.step("uses the current run for other workflow run actions", () => {
    const actual = resolveWorkflowRunTarget(currentRun, {
      eventName: "workflow_run",
      action: "requested",
      workflowRun: {
        id: 2000000000,
      },
    });
    assertEquals(actual, currentRun);
  });

  await t.step("rejects a missing triggering run id", () => {
    assertThrows(
      () =>
        resolveWorkflowRunTarget(currentRun, {
          eventName: "workflow_run",
          action: "completed",
        }),
      Error,
      "missing a valid workflow run id",
    );
  });

  await t.step("rejects an invalid triggering run attempt", () => {
    assertThrows(
      () =>
        resolveWorkflowRunTarget(currentRun, {
          eventName: "workflow_run",
          action: "completed",
          workflowRun: {
            id: 2000000000,
            runAttempt: 0,
          },
        }),
      Error,
      "invalid workflow run attempt",
    );
  });
});
