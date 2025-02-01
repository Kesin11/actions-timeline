import { setTimeout } from "node:timers/promises";
import process from "node:process";
import {
  debug,
  getBooleanInput,
  getInput,
  info,
  summary,
} from "npm:@actions/core@1.11.1";
import * as github from "npm:@actions/github@6.0.0";
import { createMermaid } from "./workflow_gantt.ts";
import { Github } from "jsr:@kesin11/gha-utils";
import { fetchWorkflowRunJobs } from "./github.ts";

const main = async () => {
  const token = getInput("github-token", { required: true });
  const showWaitingRunner = getBooleanInput("show-waiting-runner");
  const client = new Github({ token });

  info("Wait for workflow API result stability...");
  // TODO: これの待ち時間がおそらく足りていない
  // だが根本的な問題としてはfetchWorkflowJobsで得られる全てのジョブの結果がcompleteになるまで待つべき
  // exponential backoffで2, 4, 8秒waitして取得し直すようにして、それを超えてもダメだったら最後の結果を使いつつwarningのログをロググループで出すようにする、みたいな実装にしたい
  // これは題材として面白いので、Claude + Clineに解かせてみたい
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
  // const workflowJobs = await client.fetchWorkflowJobs([workflowRun]);
const workflowJobs = await fetchWorkflowRunJobs(client.octokit, 
  github.context.repo.owner,
  github.context.repo.repo,
  github.context.runId,
  runAttempt
);
  debug(JSON.stringify(workflowJobs, null, 2));

  info("Create gantt mermaid diagram...");
  const gantt = createMermaid(workflowRun, workflowJobs, { showWaitingRunner });
  await summary.addRaw(gantt).write();
  debug(gantt);

  info("Complete!");
};
main();
