import { Command } from "@cliffy/command";
import { createGanttJobs } from "./src/workflow_gantt.ts";
import { expandCompositeSteps } from "./src/composite.ts";
import { createRenderer, type OutputFormat } from "./src/renderer.ts";
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
    "--expand-composite-actions <expandCompositeActions:boolean>",
    "Expand composite action steps in the timeline. Default: false",
    { default: false },
  )
  .option(
    "--expand-composite-actions-threshold <thresholdSec:number>",
    "Duration threshold in seconds for expanding composite action steps. Default: 20",
    { default: 20 },
  )
  .option(
    "--output-format <outputFormat:string>",
    'Output format for the timeline chart: "mermaid" or "svg". Default: mermaid',
    { default: "mermaid" },
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

const jobs = options.expandCompositeActions
  ? await expandCompositeSteps(client, workflowRun, workflowJobs, {
    thresholdSec: options.expandCompositeActionsThreshold,
  })
  : workflowJobs;

const title = workflowRun.name ?? "";
const ganttJobs = createGanttJobs(workflowRun, jobs, options.showWaitingRunner);
const renderer = createRenderer(options.outputFormat as OutputFormat);
const output = renderer.render(title, ganttJobs);

if (options.output) {
  await Deno.writeTextFile(options.output, output);
} else {
  console.log(output);
}
