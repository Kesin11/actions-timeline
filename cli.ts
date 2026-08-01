import { Command } from "@cliffy/command";
import { createMermaid } from "./src/workflow_gantt.ts";
import { expandCompositeSteps } from "./src/composite.ts";
import { Github, parseWorkflowRunUrl } from "./src/github.ts";
import { expandParallelSteps } from "./src/parallel.ts";

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
    "--expand-composite-actions <expandCompositeActions:boolean>",
    "Expand composite action steps in the timeline. Default: false",
    { default: false },
  )
  .option(
    "--expand-composite-actions-threshold <thresholdSec:number>",
    "Duration threshold in seconds for expanding composite action steps. Default: 20",
    { default: 20 },
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
const workflowJobs = await client.fetchWorkflowRunJobs(workflowRun);

const parallelResult = await expandParallelSteps(
  client,
  workflowRun,
  workflowJobs,
);
parallelResult.warnings.forEach((warning) =>
  console.warn(
    `Warning: Parallel steps were not expanded for job "${warning.jobName}" (${warning.jobId}): ${warning.reason}`,
  )
);

const jobs = options.expandCompositeActions
  ? await expandCompositeSteps(client, workflowRun, parallelResult.jobs, {
    thresholdSec: options.expandCompositeActionsThreshold,
  })
  : parallelResult.jobs;

const gantt = createMermaid(workflowRun, jobs, {
  showWaitingRunner: options.showWaitingRunner,
});

if (options.output) {
  await Deno.writeTextFile(options.output, gantt);
} else {
  console.log(gantt);
}
