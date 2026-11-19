import type { Octokit } from "@octokit/rest";
import { Github, parseWorkflowRunUrl } from "../src/github.ts";
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

test("fetchWorkflowRun attempt routing", async (t) => {
  const workflow = { id: 1 };
  const calls: Array<{
    endpoint: "run" | "attempt";
    params: Record<string, unknown>;
  }> = [];
  const octokit = {
    actions: {
      getWorkflowRun: async (params: Record<string, unknown>) => {
        calls.push({ endpoint: "run", params });
        return { data: workflow };
      },
      getWorkflowRunAttempt: async (params: Record<string, unknown>) => {
        calls.push({ endpoint: "attempt", params });
        return { data: workflow };
      },
    },
  } as unknown as Octokit;
  const client = new Github({ octokit });

  await t.test(
    "uses the run endpoint without an explicit attempt",
    async () => {
      calls.length = 0;
      await client.fetchWorkflowRun("owner", "repo", 123);
      assertEquals(calls, [
        {
          endpoint: "run",
          params: { owner: "owner", repo: "repo", run_id: 123 },
        },
      ]);
    },
  );

  await t.test("uses the attempt endpoint for attempt 1", async () => {
    calls.length = 0;
    await client.fetchWorkflowRun("owner", "repo", 123, 1);
    assertEquals(calls, [
      {
        endpoint: "attempt",
        params: {
          owner: "owner",
          repo: "repo",
          run_id: 123,
          attempt_number: 1,
        },
      },
    ]);
  });
});
