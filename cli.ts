import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { createMermaid } from "./src/workflow_gantt.ts";
import {
  createOctokitForCli,
  fetchWorkflow,
  fetchWorkflowLatestAttempt,
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
const runUrl = parseWorkflowRunUrl(url);

const octokit = createOctokitForCli({
  token: options.token,
  origin: runUrl.origin,
});

const runAttempt = runUrl.runAttempt ??
  await fetchWorkflowLatestAttempt(
    octokit,
    runUrl.owner,
    runUrl.repo,
    runUrl.runId,
  );

const workflow = await fetchWorkflow(
  octokit,
  runUrl.owner,
  runUrl.repo,
  runUrl.runId,
  runAttempt,
);
const workflowJobs = await fetchWorkflowRunJobs(
  octokit,
  runUrl.owner,
  runUrl.repo,
  runUrl.runId,
  runAttempt,
);
const gantt = createMermaid(workflow, workflowJobs);

if (options.output) {
  await Deno.writeTextFile(options.output, gantt);
} else {
  console.log(gantt);
}
