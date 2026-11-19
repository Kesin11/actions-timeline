import { parseWorkflowRunUrl } from "../src/github.ts";
import { assertEquals, assertThrows, test } from "./test_util.ts";

test(parseWorkflowRunUrl.name, async (t) => {
  await t.test("Basic", () => {
    const url =
      "https://github.com/Kesin11/actions-timeline/actions/runs/1000000000/";
    const actual = parseWorkflowRunUrl(url);
    const expect = {
      origin: "https://github.com",
      owner: "Kesin11",
      repo: "actions-timeline",
      runId: 1000000000,
      runAttempt: undefined,
    };
    assertEquals(actual, expect);
  });

  await t.test("with attempt", () => {
    const url =
      "https://github.com/Kesin11/actions-timeline/actions/runs/1000000000/attempts/2";
    const actual = parseWorkflowRunUrl(url);
    const expect = {
      origin: "https://github.com",
      owner: "Kesin11",
      repo: "actions-timeline",
      runId: 1000000000,
      runAttempt: 2,
    };
    assertEquals(actual, expect);
  });

  await t.test("GHES", () => {
    const url =
      "https://your_host.github.com/Kesin11/actions-timeline/actions/runs/1000000000/attempts/2";
    const actual = parseWorkflowRunUrl(url);
    const expect = {
      origin: "https://your_host.github.com",
      owner: "Kesin11",
      repo: "actions-timeline",
      runId: 1000000000,
      runAttempt: 2,
    };
    assertEquals(actual, expect);
  });

  await t.test("throws for wrong path segments", () => {
    const url = "https://github.com/Kesin11/actions-timeline/pulls/123";
    assertThrows(
      () => parseWorkflowRunUrl(url),
      Error,
      "Invalid workflow run URL",
    );
  });

  await t.test("throws for non-numeric runId", () => {
    const url = "https://github.com/Kesin11/actions-timeline/actions/runs/abc";
    assertThrows(
      () => parseWorkflowRunUrl(url),
      Error,
      "runId must be a positive integer",
    );
  });
});
