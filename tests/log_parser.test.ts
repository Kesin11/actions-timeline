import { assertEquals } from "@std/assert";
import {
  findCompositeActionBlocks,
  parseJobLogsForCompositeSteps,
  parseLogBlocks,
  parseTimestamp,
} from "../src/log_parser.ts";

Deno.test("parseTimestamp", async (t) => {
  await t.step("should parse ISO timestamp with fraction", () => {
    const line = "2024-01-15T10:30:45.123Z Some log message";
    const result = parseTimestamp(line);
    assertEquals(result?.toISOString(), "2024-01-15T10:30:45.123Z");
  });

  await t.step("should parse ISO timestamp without fraction", () => {
    const line = "2024-01-15T10:30:45Z Some log message";
    const result = parseTimestamp(line);
    assertEquals(result?.toISOString(), "2024-01-15T10:30:45.000Z");
  });

  await t.step("should return undefined for line without timestamp", () => {
    const line = "Some log message without timestamp";
    const result = parseTimestamp(line);
    assertEquals(result, undefined);
  });
});

Deno.test("parseLogBlocks", async (t) => {
  await t.step("should parse a single group block", () => {
    const logText = `2024-01-15T10:30:00.000Z ##[group]Run actions/setup-node@v4
2024-01-15T10:30:01.000Z Installing node...
2024-01-15T10:30:05.000Z ##[endgroup]`;

    const blocks = parseLogBlocks(logText);
    assertEquals(blocks.length, 1);
    assertEquals(blocks[0].name, "actions/setup-node@v4");
    assertEquals(blocks[0].startedAt.toISOString(), "2024-01-15T10:30:00.000Z");
    assertEquals(
      blocks[0].completedAt.toISOString(),
      "2024-01-15T10:30:05.000Z",
    );
  });

  await t.step("should parse multiple group blocks", () => {
    const logText = `2024-01-15T10:30:00.000Z ##[group]Run actions/setup-node@v4
2024-01-15T10:30:05.000Z ##[endgroup]
2024-01-15T10:30:06.000Z ##[group]Run actions/cache@v3
2024-01-15T10:30:10.000Z ##[endgroup]`;

    const blocks = parseLogBlocks(logText);
    assertEquals(blocks.length, 2);
    assertEquals(blocks[0].name, "actions/setup-node@v4");
    assertEquals(blocks[1].name, "actions/cache@v3");
  });

  await t.step("should handle unclosed group blocks (safe mode)", () => {
    const logText = `2024-01-15T10:30:00.000Z ##[group]Run actions/setup-node@v4
2024-01-15T10:30:05.000Z Some log without endgroup`;

    const blocks = parseLogBlocks(logText);
    assertEquals(blocks.length, 0);
  });
});

Deno.test("findCompositeActionBlocks", async (t) => {
  await t.step("should identify repo-local composite actions", () => {
    const blocks = [
      {
        name: "./.github/actions/setup-deno-with-cache",
        startedAt: new Date("2024-01-15T10:30:00.000Z"),
        completedAt: new Date("2024-01-15T10:30:10.000Z"),
      },
      {
        name: "denoland/setup-deno@v1",
        startedAt: new Date("2024-01-15T10:30:01.000Z"),
        completedAt: new Date("2024-01-15T10:30:03.000Z"),
      },
      {
        name: "actions/setup-node@v6",
        startedAt: new Date("2024-01-15T10:30:04.000Z"),
        completedAt: new Date("2024-01-15T10:30:09.000Z"),
      },
    ];

    const composites = findCompositeActionBlocks(blocks);
    assertEquals(composites.length, 1);
    assertEquals(
      composites[0].parentStepName,
      "./.github/actions/setup-deno-with-cache",
    );
    assertEquals(composites[0].innerSteps.length, 2);
    assertEquals(composites[0].innerSteps[0].name, "denoland/setup-deno@v1");
    assertEquals(composites[0].innerSteps[1].name, "actions/setup-node@v6");
  });

  await t.step("should not identify non-composite actions", () => {
    const blocks = [
      {
        name: "actions/checkout@v4",
        startedAt: new Date("2024-01-15T10:30:00.000Z"),
        completedAt: new Date("2024-01-15T10:30:05.000Z"),
      },
    ];

    const composites = findCompositeActionBlocks(blocks);
    assertEquals(composites.length, 0);
  });

  await t.step("should stop at non-action step", () => {
    // This test verifies that blocks after a non-action step aren't included
    // The composite is followed by inner-action, then a shell step, then outer-action
    // Only inner-action should be included
    const blocks = [
      {
        name: "./.github/actions/my-action",
        startedAt: new Date("2024-01-15T10:30:00.000Z"),
        completedAt: new Date("2024-01-15T10:30:05.000Z"),
      },
      {
        name: "owner/inner-action@v1",
        startedAt: new Date("2024-01-15T10:30:01.000Z"),
        completedAt: new Date("2024-01-15T10:30:04.000Z"),
      },
      {
        name: "deno test --allow-env", // non-action step (no "/")
        startedAt: new Date("2024-01-15T10:30:05.000Z"),
        completedAt: new Date("2024-01-15T10:30:06.000Z"),
      },
      {
        name: "owner/outer-action@v2",
        startedAt: new Date("2024-01-15T10:30:07.000Z"),
        completedAt: new Date("2024-01-15T10:30:10.000Z"),
      },
    ];

    const composites = findCompositeActionBlocks(blocks);
    assertEquals(composites.length, 1);
    // Only one inner step because we stop at the shell step
    assertEquals(composites[0].innerSteps.length, 1);
    assertEquals(composites[0].innerSteps[0].name, "owner/inner-action@v1");
  });
});

Deno.test("parseJobLogsForCompositeSteps", async (t) => {
  await t.step("should parse complete log text with composite actions", () => {
    const logText =
      `2024-01-15T10:30:00.000Z ##[group]Run ./.github/actions/setup-deno-with-cache
2024-01-15T10:30:00.500Z Setting up environment
2024-01-15T10:30:01.000Z ##[group]Run denoland/setup-deno@v1
2024-01-15T10:30:01.500Z Installing Deno
2024-01-15T10:30:03.000Z ##[endgroup]
2024-01-15T10:30:04.000Z ##[group]Run actions/setup-node@v6
2024-01-15T10:30:04.500Z Installing Node
2024-01-15T10:30:09.000Z ##[endgroup]
2024-01-15T10:30:10.000Z ##[endgroup]`;

    const composites = parseJobLogsForCompositeSteps(logText);
    assertEquals(composites.length, 1);
    assertEquals(
      composites[0].parentStepName,
      "./.github/actions/setup-deno-with-cache",
    );
    assertEquals(composites[0].innerSteps.length, 2);
  });

  await t.step(
    "should return empty array for logs without composite actions",
    () => {
      const logText = `2024-01-15T10:30:00.000Z ##[group]Run actions/checkout@v4
2024-01-15T10:30:05.000Z ##[endgroup]`;

      const composites = parseJobLogsForCompositeSteps(logText);
      assertEquals(composites.length, 0);
    },
  );
});
