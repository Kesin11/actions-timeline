import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { createMermaid } from "./src/workflow_gantt.ts";
import {
  createOctokit,
  fetchWorkflow,
  fetchWorkflowRunJobs,
} from "./src/github.ts";
import { parseWorkflowRunUrl } from "./src/github.ts";

const { options, args } = await new Command()
  .name("actions-timeline-cli")
  .description("Command line tool of actions-timeline")
  .option("-t, --token <token:string>", "GitHub token. ex: $(gh auth token)")
  .option(
    "-o, --output <output:file>",
    "Output md file path. If not set output to STDOUT. ex: output.md",
  )
  .arguments("<url:string>")
  .parse(Deno.args);
const url = args[0];

const octokit = createOctokit(options.token);
const runUrl = parseWorkflowRunUrl(url);

const workflow = await fetchWorkflow(
  octokit,
  runUrl.owner,
  runUrl.repo,
  runUrl.runId,
  runUrl.runAttempt ?? 1,
);
const workflowJobs = await fetchWorkflowRunJobs(
  octokit,
  runUrl.owner,
  runUrl.repo,
  runUrl.runId,
  runUrl.runAttempt ?? 1,
);
const gantt = createMermaid(workflow, workflowJobs);

if (options.output) {
  await Deno.writeTextFile(options.output, gantt);
} else {
  console.log(gantt);
}
