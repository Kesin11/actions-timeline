import { Command } from "@cliffy/command";
import { createMermaid } from "./src/workflow_gantt.ts";
import { fetchJobLogs } from "./src/job_logs.ts";
import { Github, parseWorkflowRunUrl } from "@kesin11/gha-utils";

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
  .option(
    "--show-composite-actions <showCompositeActions:boolean>",
    "Decompose repo-local Composite Actions into inner steps. Default: false",
    { default: false },
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
const workflowJobs = await client.fetchWorkflowRunJobs(workflowRun);

// Fetch job logs if show-composite-actions is enabled
let jobLogs: Map<number, string> | undefined;
if (options.showCompositeActions) {
  jobLogs = await fetchJobLogs(
    client,
    runUrl.owner,
    runUrl.repo,
    workflowJobs,
  );
}

const gantt = createMermaid(workflowRun, workflowJobs, {
  showWaitingRunner: options.showWaitingRunner,
  showCompositeActions: options.showCompositeActions,
}, jobLogs);

if (options.output) {
  await Deno.writeTextFile(options.output, gantt);
} else {
  console.log(gantt);
}
