import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runCli } from "../cli.ts";
import { runActionPost } from "../src/action.ts";
import type { Github, WorkflowJobs, WorkflowRun } from "../src/github.ts";
import { assertEquals, test } from "./test_util.ts";

const fixtureUrl = (name: string): URL =>
  new URL(`./fixture/compat/${name}`, import.meta.url);
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
): Github {
  return {
    fetchWorkflowRun: async () => workflowRun,
    fetchWorkflowRunJobs: async () => workflowJobs,
    fetchJobLog: async () => "",
  } as unknown as Github;
}

test("CLI compatibility fixture", async (t) => {
  const { workflowRun, workflowJobs } = await loadApiFixture();
  const expectedMermaid = await readGolden("mermaid.md");
  const expectedStderr = `${await readGolden("cli-stderr.txt")}\n`;

  await t.test("writes Mermaid to stdout without changing bytes", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    await runCli(
      ["https://github.com/owner/example/actions/runs/1001/attempts/1"],
      {
        createClient: () => fixtureClient(workflowRun, workflowJobs),
        log: (message) => stdout.push(`${message}\n`),
        warn: (message) => stderr.push(message),
      },
    );

    assertEquals(stdout, [`${expectedMermaid}\n`]);
    assertEquals(`${stderr.join("\n")}\n`, expectedStderr);
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
});

test("Action compatibility fixture", async () => {
  const { workflowRun, workflowJobs } = await loadApiFixture();
  const expectedMermaid = await readGolden("mermaid.md");
  const logs: string[] = [];
  const annotations: string[] = [];
  const debugLogs: string[] = [];
  const waits: number[] = [];
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
    createClient: () => fixtureClient(workflowRun, workflowJobs),
    debug: (message) => debugLogs.push(message),
    env: { GITHUB_RUN_ATTEMPT: "1" },
    getBooleanInput: (name) => (name === "show-waiting-runner" ? true : false),
    getInput: (name) => (name === "github-token" ? "fixture-token" : "20"),
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
});
