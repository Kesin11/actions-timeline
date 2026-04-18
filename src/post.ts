import { setTimeout } from "node:timers/promises";
import process from "node:process";
import { debug, getBooleanInput, getInput, info, summary } from "@actions/core";
import * as github from "@actions/github";
import { createGanttJobs } from "./workflow_gantt.ts";
import { expandCompositeSteps } from "./composite.ts";
import { createRenderer, type OutputFormat } from "./renderer.ts";
import { Github } from "@kesin11/gha-utils";

const main = async () => {
  const token = getInput("github-token", { required: true });
  const showWaitingRunner = getBooleanInput("show-waiting-runner");
  const expandCompositeActions = getBooleanInput("expand-composite-actions");
  const expandCompositeActionsThreshold = Number(
    getInput("expand-composite-actions-threshold"),
  );
  const outputFormat = (getInput("output-format") || "mermaid") as OutputFormat;
  const client = new Github({ token });

  info("Wait for workflow API result stability...");
  await setTimeout(1000);

  info("Fetch workflow...");
  // Currently, @actions/core does not provide runAttempt.
  // ref: https://github.com/actions/toolkit/pull/1387
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT
    ? Number(process.env.GITHUB_RUN_ATTEMPT)
    : 1;
  const workflowRun = await client.fetchWorkflowRun(
    github.context.repo.owner,
    github.context.repo.repo,
    github.context.runId,
    runAttempt,
  );
  debug(JSON.stringify(workflowRun, null, 2));
  info("Fetch workflow_job...");
  const workflowJobs = await client.fetchWorkflowRunJobs(workflowRun);

  debug(JSON.stringify(workflowJobs, null, 2));

  let jobs = workflowJobs;
  if (expandCompositeActions) {
    info("Expanding composite action steps...");
    jobs = await expandCompositeSteps(client, workflowRun, workflowJobs, {
      thresholdSec: expandCompositeActionsThreshold,
    });
  }

  info("Create gantt diagram...");
  const title = workflowRun.name ?? "";
  const ganttJobs = createGanttJobs(workflowRun, jobs, showWaitingRunner);
  const renderer = createRenderer(outputFormat);
  const output = renderer.render(title, ganttJobs);

  if (outputFormat === "svg") {
    // GitHub Job Summary は <svg> タグをサニタイズ除去するため Base64 <img> に変換する
    const base64 = btoa(unescape(encodeURIComponent(output)));
    await summary.addRaw(
      `<img src="data:image/svg+xml;base64,${base64}" alt="Actions Timeline" />`,
    ).write();
  } else {
    await summary.addRaw(output).write();
  }
  debug(output);

  info("Complete!");
};
main();
