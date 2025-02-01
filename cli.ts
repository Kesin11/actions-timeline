import { Command } from "@cliffy/command";
import { createMermaid } from "./src/workflow_gantt.ts";
import { Github, parseWorkflowRunUrl } from "@kesin11/gha-utils";
import { fetchWorkflowRunJobs } from "./src/github.ts";

const { options, args } = await new Command()
  .name("actions-timeline-cli")
  .description("Command line tool of actions-timeline")
  .option("-t, --token <token:string>", "GitHub token. ex: $(gh auth token)")
  .option(
    "-o, --output <output:file>",
    "Output md file path. If not set output to STDOUT. ex: output.md",
  )
  .option(
    "--show-waiting-runner <showWaitingRunner:boolean>",
    "Show waiting runner time in the timeline. Default: true",
    { default: true },
  )
  .arguments("<url:string>")
  .parse(Deno.args);

const url = args[0];
const runUrl = parseWorkflowRunUrl(url);

const host = (runUrl.origin !== "https://github.com")
  ? runUrl.origin
  : undefined;
const client = new Github({ token: options.token, host });

const workflowRun = await client.fetchWorkflowRun(
  runUrl.owner,
  runUrl.repo,
  runUrl.runId,
  runUrl.runAttempt,
);
// const workflowJobs = await client.fetchWorkflowJobs([workflowRun]);
const workflowJobs = await fetchWorkflowRunJobs(client.octokit, 
  runUrl.owner,
  runUrl.repo,
  runUrl.runId,
  1
);

const gantt = createMermaid(workflowRun, workflowJobs, {
  showWaitingRunner: options.showWaitingRunner,
});

if (options.output) {
  await Deno.writeTextFile(options.output, gantt);
} else {
  console.log(gantt);
}
