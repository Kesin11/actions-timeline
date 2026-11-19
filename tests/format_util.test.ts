import {
  escapeName,
  formatShortElapsedTime,
  formatStep,
  truncateName,
} from "../src/format_util.ts";
import type { ganttStep } from "../src/types.ts";
import { assertEquals, test } from "./test_util.ts";

test(formatStep.name, async (t) => {
  const baseStep: ganttStep = {
    name: "Test step",
    id: "job0-1",
    status: "",
    position: "after job0-0",
    sec: 1,
  };

  await t.test("status:empty", () => {
    const step: ganttStep = { ...baseStep, status: "" };
    const actual = formatStep(step);
    const expect = `${step.name} :${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.test("status:done", () => {
    const step: ganttStep = { ...baseStep, status: "done" };
    const actual = formatStep(step);
    const expect = `${step.name} :done, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.test("status:crit", () => {
    const step: ganttStep = { ...baseStep, status: "crit" };
    const actual = formatStep(step);
    const expect = `${step.name} :crit, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.test("status:active", () => {
    const step: ganttStep = { ...baseStep, status: "active" };
    const actual = formatStep(step);
    const expect = `${step.name} :active, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
});
test(formatShortElapsedTime.name, async (t) => {
  await t.test("9sec => 9s", () => {
    const elapsedSec = 9;
    assertEquals(formatShortElapsedTime(elapsedSec), `9s`);
  });
  await t.test("59sec => 59s", () => {
    const elapsedSec = 59;
    assertEquals(formatShortElapsedTime(elapsedSec), `59s`);
  });
  await t.test("60sec => 1m0s", () => {
    const elapsedSec = 60;
    assertEquals(formatShortElapsedTime(elapsedSec), `1m0s`);
  });
  await t.test("61sec => 1m1s", () => {
    const elapsedSec = 61;
    assertEquals(formatShortElapsedTime(elapsedSec), `1m1s`);
  });
  await t.test("3600sec => 1h0m0s", () => {
    const elapsedSec = 60 * 60; // 1hour
    assertEquals(formatShortElapsedTime(elapsedSec), `1h0m0s`);
  });
  await t.test("3660sec => 1h1m0s", () => {
    const elapsedSec = 60 * 60 + 60; // 1hour 1min
    assertEquals(formatShortElapsedTime(elapsedSec), `1h1m0s`);
  });
  await t.test("3661sec => 1h1m1s", () => {
    const elapsedSec = 60 * 60 + 60 + 1; // 1hour 1min 1sec
    assertEquals(formatShortElapsedTime(elapsedSec), `1h1m1s`);
  });
});

test(truncateName.name, async (t) => {
  const maxLength = 80;
  await t.test("short name unchanged", () => {
    assertEquals(truncateName("short name", maxLength), "short name");
  });
  await t.test("exactly max length unchanged", () => {
    const name = "a".repeat(maxLength);
    assertEquals(truncateName(name, maxLength), name);
  });
  await t.test("long name truncated with ellipsis", () => {
    const name = "a".repeat(100);
    assertEquals(truncateName(name, maxLength), "a".repeat(77) + "...");
  });
  await t.test("custom max length", () => {
    assertEquals(truncateName("abcdefghij", 5), "ab...");
  });
});

test(escapeName.name, async (t) => {
  await t.test("Step name has colon", () => {
    const stepName = "check: deno";
    const actual = escapeName(stepName);
    const expect = "check deno";
    assertEquals(actual, expect);
  });
  await t.test("Step has name semicolon", () => {
    const stepName = `Run if [ "pull_request" = "push" ]; then`;
    const actual = escapeName(stepName);
    const expect = `Run if [ "pull_request" = "push" ] then`;
    assertEquals(actual, expect);
  });
});
