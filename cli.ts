import yargs from "https://deno.land/x/yargs@v17.7.2-deno/deno.ts";
import type { YargsInstance } from "https://deno.land/x/yargs@v17.7.2-deno/build/lib/yargs-factory.js";
import { createMermaid } from "./src/workflow_gantt.ts";
import {
  createOctokit,
  fetchWorkflow,
  fetchWorkflowRunJobs,
} from "./src/github.ts";
import { parseWorkflowRunUrl } from "./src/github.ts";

const args = yargs(Deno.args)
  .command("$0 <url>", "the default command", (yargs: YargsInstance) => {
    return yargs.positional("url", {
      type: "string",
      describe:
        "URL to show workflow run. ex: https://github.com/{OWNER}/{REPO}/actions/runs/{RUN_ID}/atempts/{ATTEMPT_NUMBER}",
    });
  })
  .options({
    token: {
      type: "string",
      alias: "t",
      describe: "GitHub token. ex: $(gh auth token)",
    },
  })
  .usage("Usage: $0 <url> [options]")
  .demandCommand(1)
  .strictOptions()
  .parse();

const octokit = createOctokit(args.token);
const runUrl = parseWorkflowRunUrl(args.url);

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

console.log(gantt);
