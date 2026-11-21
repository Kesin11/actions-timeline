import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { expandCompositeSteps } from "./src/logic/composite.ts";
import {
  Github,
  parseWorkflowRunUrl,
  type WorkflowRun,
} from "./src/github/github.ts";
import { createHtmlReport } from "./src/output/html/report.ts";
import { expandParallelSteps } from "./src/logic/parallel.ts";
import { WorkflowModel } from "./src/models/workflow_file.ts";
import { createMermaid } from "./src/output/mermaid/workflow_gantt.ts";

type OutputFormat = "mermaid" | "html";

type CliDependencies = {
  createClient?: (options: { token?: string; host?: string }) => Github;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  writeFile?: typeof writeFile;
};

const parseBoolean = (value: string): boolean => {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InvalidArgumentError(`Invalid boolean value: ${value}`);
};

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError(`Invalid number value: ${value}`);
  }
  return parsed;
};

const parseFormat = (value: string): OutputFormat => {
  if (value === "mermaid" || value === "html") return value;
  throw new InvalidArgumentError(
    `Invalid format value: ${value}. Expected "mermaid" or "html".`,
  );
};

export function createProgram(): Command {
  return new Command()
    .name("actions-timeline-cli")
    .description("Command line tool of actions-timeline")
    .option("-t, --token <token>", "GitHub token. ex: $(gh auth token)")
    .option(
      "-o, --output <output>",
      "Output file path. If not set output to STDOUT. ex: output.md or timeline.html",
    )
    .option(
      "-f, --format <format>",
      "Output format: mermaid or html. Default: mermaid",
      parseFormat,
      "mermaid",
    )
    .option(
      "--show-waiting-runner <showWaitingRunner>",
      "Show waiting runner time in the timeline. Default: true",
      parseBoolean,
      true,
    )
    .option(
      "--expand-composite-actions <expandCompositeActions>",
      "Expand composite action steps in the timeline. Default: true",
      parseBoolean,
      true,
    )
    .option(
      "--expand-composite-actions-threshold <thresholdSec>",
      "Duration threshold in seconds for expanding composite action steps. Default: 0",
      parseNumber,
      0,
    )
    .argument("<url>");
}

async function fetchWorkflowModelSafe(
  client: Github,
  workflowRun: WorkflowRun,
): Promise<WorkflowModel | undefined> {
  if (typeof client.fetchWorkflowFiles !== "function") return undefined;
  try {
    const [fileContent] = await client.fetchWorkflowFiles([workflowRun]);
    return fileContent ? new WorkflowModel(fileContent) : undefined;
  } catch {
    return undefined;
  }
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
    format: OutputFormat;
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

  const output =
    options.format === "html"
      ? createHtmlReport(workflowRun, jobs, {
          showWaitingRunner: options.showWaitingRunner,
          workflowModel: await fetchWorkflowModelSafe(client, workflowRun),
        })
      : createMermaid(workflowRun, jobs, {
          showWaitingRunner: options.showWaitingRunner,
        });

  if (options.output) {
    await (dependencies.writeFile ?? writeFile)(options.output, output, "utf8");
  } else {
    (dependencies.log ?? console.log)(output);
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await runCli(process.argv.slice(2));
}
