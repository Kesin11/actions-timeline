import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { expandCompositeSteps } from "./src/composite.ts";
import { Github, parseWorkflowRunUrl } from "./src/github.ts";
import { expandParallelSteps } from "./src/parallel.ts";
import { createMermaid } from "./src/workflow_gantt.ts";

type CliDependencies = {
  createClient?: (options: { token?: string; host?: string }) => Github;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  writeFile?: typeof writeFile;
};

const parseBoolean = (value: string): boolean => {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
};

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return parsed;
};

function createProgram(): Command {
  return new Command()
    .name("actions-timeline-cli")
    .description("Command line tool of actions-timeline")
    .option("-t, --token <token>", "GitHub token. ex: $(gh auth token)")
    .option(
      "-o, --output <output>",
      "Output md file path. If not set output to STDOUT. ex: output.md",
    )
    .option(
      "--show-waiting-runner <showWaitingRunner>",
      "Show waiting runner time in the timeline. Default: true",
      parseBoolean,
      true,
    )
    .option(
      "--expand-composite-actions <expandCompositeActions>",
      "Expand composite action steps in the timeline. Default: false",
      parseBoolean,
      false,
    )
    .option(
      "--expand-composite-actions-threshold <thresholdSec>",
      "Duration threshold in seconds for expanding composite action steps. Default: 20",
      parseNumber,
      20,
    )
    .argument("<url>");
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies = {},
): Promise<void> {
  const program = createProgram();
  program.parse(argv, { from: "user" });

  const options = program.opts<{
    token?: string;
    output?: string;
    showWaitingRunner: boolean;
    expandCompositeActions: boolean;
    expandCompositeActionsThreshold: number;
  }>();
  const [url] = program.processedArgs as [string];
  const runUrl = parseWorkflowRunUrl(url);
  const host =
    runUrl.origin !== "https://github.com" ? runUrl.origin : undefined;
  const client = (
    dependencies.createClient ?? ((clientOptions) => new Github(clientOptions))
  )({
    token: options.token,
    host,
  });

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
  const warn = dependencies.warn ?? console.warn;
  parallelResult.warnings.forEach((item) => {
    warn(
      `Warning: Parallel steps were not expanded for job "${item.jobName}" (${item.jobId}): ${item.reason}`,
    );
  });

  const jobs = options.expandCompositeActions
    ? await expandCompositeSteps(client, workflowRun, parallelResult.jobs, {
        thresholdSec: options.expandCompositeActionsThreshold,
      })
    : parallelResult.jobs;
  const gantt = createMermaid(workflowRun, jobs, {
    showWaitingRunner: options.showWaitingRunner,
  });

  if (options.output) {
    await (dependencies.writeFile ?? writeFile)(options.output, gantt, "utf8");
  } else {
    (dependencies.log ?? console.log)(gantt);
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await runCli(process.argv.slice(2));
}
