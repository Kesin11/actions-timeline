export type WorkflowRunTarget = {
  owner: string;
  repo: string;
  runId: number;
  runAttempt: number;
};

export type WorkflowRunEvent = {
  eventName: string;
  action?: string;
  workflowRun?: {
    id?: unknown;
    runAttempt?: unknown;
  };
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function resolveWorkflowRunTarget(
  currentRun: WorkflowRunTarget,
  event: WorkflowRunEvent,
): WorkflowRunTarget {
  if (event.eventName !== "workflow_run" || event.action !== "completed") {
    return currentRun;
  }

  const runId = event.workflowRun?.id;
  if (!isPositiveInteger(runId)) {
    throw new Error(
      "workflow_run.completed payload is missing a valid workflow run id",
    );
  }

  const runAttempt = event.workflowRun?.runAttempt ?? 1;
  if (!isPositiveInteger(runAttempt)) {
    throw new Error(
      "workflow_run.completed payload has an invalid workflow run attempt",
    );
  }

  return {
    owner: currentRun.owner,
    repo: currentRun.repo,
    runId,
    runAttempt,
  };
}
