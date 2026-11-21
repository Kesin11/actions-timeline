import { readFile } from "node:fs/promises";
import { runCli } from "../../../cli.ts";
import type { Github, WorkflowJobs, WorkflowRun } from "../../../src/github/github.ts";

const [workflowRunJson, workflowJobsJson] = await Promise.all([
  readFile(new URL("./workflow-run.json", import.meta.url), "utf8"),
  readFile(new URL("./workflow-jobs.json", import.meta.url), "utf8"),
]);
const workflowRun = JSON.parse(workflowRunJson) as WorkflowRun;
const workflowJobs = JSON.parse(workflowJobsJson) as WorkflowJobs;
const client = {
  fetchWorkflowRun: async () => workflowRun,
  fetchWorkflowRunJobs: async () => workflowJobs,
  fetchWorkflowFiles: async () => [{ content: "name: CI\njobs: {}\n", raw: { path: ".github/workflows/ci.yml" } }],
  fetchJobLog: async () => "",
} as unknown as Github;

await runCli(process.argv.slice(2), {
  createClient: () => client,
});
