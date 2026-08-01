import type { WorkflowJobs, WorkflowRun } from "../../src/github.ts";

export const workflow = {
  id: 30668200410,
  name: "ci",
  run_started_at: "2026-07-31T21:54:41Z",
  repository: {
    name: "nuxt",
    owner: { login: "nuxt" },
  },
} as WorkflowRun;

export const jobs = [{
  id: 91280033726,
  name: "typecheck (ubuntu-24.04-arm, bundler)",
  status: "completed",
  conclusion: "success",
  created_at: "2026-07-31T21:54:52Z",
  started_at: "2026-07-31T21:54:56Z",
  completed_at: "2026-07-31T21:57:31Z",
  steps: [
    {
      number: 1,
      name: "Set up job",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T21:54:56Z",
      completed_at: "2026-07-31T21:54:57Z",
    },
    {
      number: 3,
      name: "Run voidzero-dev/setup-vp@250f29ce",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T21:54:57Z",
      completed_at: "2026-07-31T21:55:20Z",
    },
    {
      number: 4,
      name: "Test (types)",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T21:55:20Z",
      completed_at: "2026-07-31T21:56:21Z",
    },
    {
      number: 5,
      name: "Typecheck (docs)",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T21:55:20Z",
      completed_at: "2026-07-31T21:57:30Z",
    },
    {
      number: 6,
      name: "Parallel group",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T21:55:20Z",
      completed_at: "2026-07-31T21:57:30Z",
    },
    {
      number: 7,
      name: "Cancel workflow on failure",
      status: "completed",
      conclusion: "skipped",
      started_at: "2026-07-31T21:57:30Z",
      completed_at: "2026-07-31T21:57:30Z",
    },
  ],
}] as WorkflowJobs;

export const log = `
2026-07-31T21:55:20.7598592Z ##[group]Run vp run test:types
2026-07-31T21:55:20.7795459Z ##[group]Run vp run typecheck:docs
2026-07-31T21:55:20.7920202Z Waiting for background step(s) to complete: Test (types), Typecheck (docs)
2026-07-31T21:57:30.3086853Z Finished waiting for background step(s).
2026-07-31T21:57:30.3087533Z   Test (types): Succeeded
2026-07-31T21:57:30.3087840Z   Typecheck (docs): Succeeded
`;
