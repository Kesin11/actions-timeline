import { assertEquals } from "@std/assert";
import { extractSubSteps, parseLogBlocks } from "../src/composite.ts";

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

  await t.step("returns empty when expectedStepCount is undefined", () => {
    const subSteps = extractSubSteps(
      logBlocks,
      "2024-01-15T10:00:05Z",
      "2024-01-15T10:00:15Z",
      "completed",
      "success",
      "./.github/actions/setup",
      undefined,
    );
    assertEquals(subSteps, []);
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
