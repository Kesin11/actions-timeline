import { assertEquals } from "@std/assert";
import { extractSubSteps, parseLogBlocks } from "../src/composite.ts";

Deno.test("parseLogBlocks", async (t) => {
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
    assertEquals(blocks.length, 3);
    assertEquals(blocks[0].name, "Run ./.github/actions/setup");
    assertEquals(blocks[0].startedAt.toISOString(), "2024-01-15T10:00:00.000Z");
    assertEquals(blocks[1].name, 'Run echo "hello"');
    assertEquals(blocks[1].startedAt.toISOString(), "2024-01-15T10:00:01.000Z");
    assertEquals(blocks[2].name, "Run npm install");
    assertEquals(blocks[2].startedAt.toISOString(), "2024-01-15T10:00:02.000Z");
  });

  await t.step("returns empty array for log without groups", () => {
    const logText = `2024-01-15T10:00:00.0000000Z Some log line
2024-01-15T10:00:01.0000000Z Another log line`;
    const blocks = parseLogBlocks(logText);
    assertEquals(blocks.length, 0);
  });

  await t.step("returns empty array for empty log", () => {
    const blocks = parseLogBlocks("");
    assertEquals(blocks.length, 0);
  });
});

Deno.test("extractSubSteps", async (t) => {
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
    // Sub-steps inside composite
    { name: "Run echo step1", startedAt: new Date("2024-01-15T10:00:06Z") },
    { name: "Run npm install", startedAt: new Date("2024-01-15T10:00:07Z") },
    { name: "Run npm run build", startedAt: new Date("2024-01-15T10:00:10Z") },
    // Block outside composite range (after)
    { name: "Run echo done", startedAt: new Date("2024-01-15T10:00:20Z") },
  ];

  await t.step("extracts sub-steps within composite time range", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "success",
    );

    assertEquals(subSteps.length, 3);
    // First sub-step (header skipped)
    assertEquals(subSteps[0].name, "echo step1");
    assertEquals(subSteps[0].started_at, "2024-01-15T10:00:06.000Z");
    assertEquals(subSteps[0].completed_at, "2024-01-15T10:00:07.000Z");
    // Second sub-step
    assertEquals(subSteps[1].name, "npm install");
    assertEquals(subSteps[1].started_at, "2024-01-15T10:00:07.000Z");
    assertEquals(subSteps[1].completed_at, "2024-01-15T10:00:10.000Z");
    // Last sub-step uses composite completed_at
    assertEquals(subSteps[2].name, "npm run build");
    assertEquals(subSteps[2].started_at, "2024-01-15T10:00:10.000Z");
    assertEquals(subSteps[2].completed_at, "2024-01-15T10:00:15Z");
  });

  await t.step("inherits status and conclusion from composite step", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "failure",
    );

    for (const subStep of subSteps) {
      assertEquals(subStep.status, "completed");
      assertEquals(subStep.conclusion, "failure");
    }
  });

  await t.step("returns empty for single block (header only)", () => {
    const singleBlock = [
      {
        name: "Run ./.github/actions/setup",
        startedAt: new Date("2024-01-15T10:00:05Z"),
      },
    ];
    const subSteps = extractSubSteps(
      singleBlock,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "success",
    );
    assertEquals(subSteps.length, 0);
  });

  await t.step("returns empty for no blocks in range", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T11:00:00Z",
      "2024-01-15T11:00:10Z",
      "completed",
      "success",
    );
    assertEquals(subSteps.length, 0);
  });
});
