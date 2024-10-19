import { assertEquals } from "@std/assert";
import { ganttStep } from "../src/types.ts";
import {
  escapeName,
  formatShortElapsedTime,
  formatStep,
} from "../src/format_util.ts";

Deno.test(formatStep.name, async (t) => {
  const baseStep: ganttStep = {
    name: "Test step",
    id: "job0-1",
    status: "",
    position: "after job0-0",
    sec: 1,
  };

  await t.step("status:empty", () => {
    const step: ganttStep = { ...baseStep, status: "" };
    const actual = formatStep(step);
    const expect = `${step.name} :${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.step("status:done", () => {
    const step: ganttStep = { ...baseStep, status: "done" };
    const actual = formatStep(step);
    const expect =
      `${step.name} :done, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.step("status:crit", () => {
    const step: ganttStep = { ...baseStep, status: "crit" };
    const actual = formatStep(step);
    const expect =
      `${step.name} :crit, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
  await t.step("status:active", () => {
    const step: ganttStep = { ...baseStep, status: "active" };
    const actual = formatStep(step);
    const expect =
      `${step.name} :active, ${step.id}, ${step.position}, ${step.sec}s`;
    assertEquals(actual, expect);
  });
});
Deno.test(formatShortElapsedTime.name, async (t) => {
  await t.step("9sec => 9s", () => {
    const elapsedSec = 9;
    assertEquals(formatShortElapsedTime(elapsedSec), `9s`);
  });
  await t.step("59sec => 59s", () => {
    const elapsedSec = 59;
    assertEquals(formatShortElapsedTime(elapsedSec), `59s`);
  });
  await t.step("60sec => 1m0s", () => {
    const elapsedSec = 60;
    assertEquals(formatShortElapsedTime(elapsedSec), `1m0s`);
  });
  await t.step("61sec => 1m1s", () => {
    const elapsedSec = 61;
    assertEquals(formatShortElapsedTime(elapsedSec), `1m1s`);
  });
  await t.step("3600sec => 1h0m0s", () => {
    const elapsedSec = 60 * 60; // 1hour
    assertEquals(formatShortElapsedTime(elapsedSec), `1h0m0s`);
  });
  await t.step("3660sec => 1h1m0s", () => {
    const elapsedSec = 60 * 60 + 60; // 1hour 1min
    assertEquals(formatShortElapsedTime(elapsedSec), `1h1m0s`);
  });
  await t.step("3661sec => 1h1m1s", () => {
    const elapsedSec = 60 * 60 + 60 + 1; // 1hour 1min 1sec
    assertEquals(formatShortElapsedTime(elapsedSec), `1h1m1s`);
  });
});

Deno.test(escapeName.name, async (t) => {
  await t.step("Step name has colon", () => {
    const stepName = "check: deno";
    const actual = escapeName(stepName);
    const expect = "check deno";
    assertEquals(actual, expect);
  });
  await t.step("Step has name semicolon", () => {
    const stepName = `Run if [ "pull_request" = "push" ]; then`;
    const actual = escapeName(stepName);
    const expect = `Run if [ "pull_request" = "push" ] then`;
    assertEquals(actual, expect);
  });
});
