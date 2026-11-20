import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../cli.ts";
import { runActionPost } from "../src/action.ts";
import type { Github, WorkflowJobs, WorkflowRun } from "../src/github.ts";

const fixtureUrl = (name: string): URL =>
  new URL(`./fixture/contract/${name}`, import.meta.url);
const fixturePath = (name: string): string => fileURLToPath(fixtureUrl(name));
const readFixture = (name: string): Promise<string> =>
  readFile(fixturePath(name), "utf8");
const readGolden = async (name: string): Promise<string> => {
  const value = await readFixture(name);
  return value.endsWith("\n") ? value.slice(0, -1) : value;
};

async function loadApiFixture(): Promise<{
  workflowRun: WorkflowRun;
  workflowJobs: WorkflowJobs;
}> {
  const [workflowRun, workflowJobs] = await Promise.all([
    readFixture("workflow-run.json"),
    readFixture("workflow-jobs.json"),
  ]);
  return {
    workflowRun: JSON.parse(workflowRun) as WorkflowRun,
    workflowJobs: JSON.parse(workflowJobs) as WorkflowJobs,
  };
}

function fixtureClient(
  workflowRun: WorkflowRun,
  workflowJobs: WorkflowJobs,
  calls?: { fetchWorkflowRun?: unknown[][] },
): Github {
  return {
    fetchWorkflowRun: async (...args: unknown[]) => {
      calls?.fetchWorkflowRun?.push(args);
      return workflowRun;
    },
    fetchWorkflowRunJobs: async () => workflowJobs,
    fetchJobLog: async () => "",
  } as unknown as Github;
}

test("CLI behavior contract", async (t) => {
  const { workflowRun, workflowJobs } = await loadApiFixture();
  const expectedMermaid = await readGolden("mermaid.md");
  const expectedStderr = `${await readGolden("cli-stderr.txt")}\n`;

  await t.test("writes Mermaid to stdout without changing bytes", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const clientOptions: unknown[] = [];
    const calls = { fetchWorkflowRun: [] as unknown[][] };
    await runCli(
      ["https://github.com/owner/example/actions/runs/1001/attempts/1"],
      {
        createClient: (options) => {
          clientOptions.push(options);
          return fixtureClient(workflowRun, workflowJobs, calls);
        },
        log: (message) => stdout.push(`${message}\n`),
        warn: (message) => stderr.push(message),
      },
    );

    assertEquals(stdout, [`${expectedMermaid}\n`]);
    assertEquals(`${stderr.join("\n")}\n`, expectedStderr);
    assertEquals(clientOptions, [{ token: undefined, host: undefined }]);
    assertEquals(calls.fetchWorkflowRun, [["owner", "example", 1001, 1]]);
  });

  await t.test("writes the same bytes to the output file", async () => {
    const output: { path?: string; data?: string; encoding?: string } = {};
    await runCli(
      [
        "https://github.com/owner/example/actions/runs/1001",
        "--output",
        "output.md",
        "--show-waiting-runner",
        "true",
      ],
      {
        createClient: () => fixtureClient(workflowRun, workflowJobs),
        warn: () => {},
        writeFile: async (path, data, encoding) => {
          output.path = String(path);
          output.data = String(data);
          output.encoding = String(encoding);
        },
      },
    );

    assertEquals(output, {
      path: "output.md",
      data: expectedMermaid,
      encoding: "utf8",
    });
  });

  await t.test("preserves subprocess streams and exit codes", () => {
    const result = spawnSync(
      process.execPath,
      [
        fixturePath("cli-runner.ts"),
        "https://github.com/owner/example/actions/runs/1001/attempts/1",
      ],
      { encoding: "utf8" },
    );

    assertEquals(result.status, 0);
    assertEquals(result.stdout, `${expectedMermaid}\n`);
    assertEquals(result.stderr, expectedStderr);
  });

  await t.test("reports invalid option values without a stack trace", () => {
    const result = spawnSync(
      process.execPath,
      [
        fixturePath("cli-runner.ts"),
        "https://github.com/owner/example/actions/runs/1001",
        "--show-waiting-runner",
        "yes",
      ],
      { encoding: "utf8" },
    );

    assertEquals(result.status, 1);
    assertEquals(result.stdout, "");
    assertEquals(
      result.stderr.includes(
        "error: option '--show-waiting-runner <showWaitingRunner>' argument 'yes' is invalid",
      ),
      true,
    );
    assertEquals(result.stderr.includes("at parseBoolean"), false);
  });
});

test("Action behavior contract", async () => {
  const { workflowRun, workflowJobs } = await loadApiFixture();
  const expectedMermaid = await readGolden("mermaid.md");
  const logs: string[] = [];
  const annotations: string[] = [];
  const debugLogs: string[] = [];
  const waits: number[] = [];
  const getInputCalls: string[] = [];
  const getBooleanInputCalls: string[] = [];
  const clientOptions: unknown[] = [];
  const fetchCalls = { fetchWorkflowRun: [] as unknown[][] };
  let summary = "";
  const summaryWriter = {
    addRaw(markdown: string) {
      summary += markdown;
      return this;
    },
    async write() {
      return undefined;
    },
  };

  await runActionPost({
    createClient: (options) => {
      clientOptions.push(options);
      return fixtureClient(workflowRun, workflowJobs, fetchCalls);
    },
    debug: (message) => debugLogs.push(message),
    env: { GITHUB_RUN_ATTEMPT: "1" },
    getBooleanInput: (name) => {
      getBooleanInputCalls.push(name);
      return name === "show-waiting-runner";
    },
    getInput: (name) => {
      getInputCalls.push(name);
      return name === "github-token" ? "fixture-token" : "20";
    },
    info: (message) => logs.push(message),
    repository: { owner: "owner", repo: "example", runId: 1001 },
    summary: summaryWriter,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    warning: (message) => annotations.push(message),
  });

  assertEquals(summary, await readGolden("action-summary.md"));
  assertEquals(logs.join("\n"), await readGolden("action-info.txt"));
  assertEquals(
    annotations.join("\n"),
    await readGolden("action-annotations.txt"),
  );
  assertEquals(waits, [1000]);
  assertEquals(debugLogs.at(-1), expectedMermaid);
  assertEquals(clientOptions, [{ token: "fixture-token" }]);
  assertEquals(fetchCalls.fetchWorkflowRun, [["owner", "example", 1001, 1]]);
  assertEquals(getInputCalls, [
    "github-token",
    "expand-composite-actions-threshold",
  ]);
  assertEquals(getBooleanInputCalls, [
    "show-waiting-runner",
    "expand-composite-actions",
  ]);
});
