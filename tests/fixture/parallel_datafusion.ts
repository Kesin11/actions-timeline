import type { WorkflowJobs, WorkflowRun } from "../../src/github.ts";

export const workflow = {
  id: 30673491143,
  name: "Datafusion extended tests",
  run_started_at: "2026-07-31T23:39:40Z",
  repository: {
    name: "datafusion",
    owner: { login: "apache" },
  },
} as WorkflowRun;

export const jobs = [{
  id: 91295892639,
  name: "Run sqllogictests with the sqlite test suite",
  status: "completed",
  conclusion: "success",
  created_at: "2026-07-31T23:39:41Z",
  started_at: "2026-07-31T23:40:02Z",
  completed_at: "2026-07-31T23:41:25Z",
  steps: [
    {
      number: 1,
      name: "Set up job",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T23:40:02Z",
      completed_at: "2026-07-31T23:40:03Z",
    },
    {
      number: 4,
      name: "Run runs-on/action@4e5f7239",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T23:40:03Z",
      completed_at: "2026-07-31T23:40:19Z",
    },
    {
      number: 5,
      name: "Run actions/checkout@3d3c42e5",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T23:40:19Z",
      completed_at: "2026-07-31T23:41:24Z",
    },
    {
      number: 6,
      name: "Install protobuf compiler",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T23:40:19Z",
      completed_at: "2026-07-31T23:40:22Z",
    },
    {
      number: 7,
      name: "Parallel group",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T23:40:19Z",
      completed_at: "2026-07-31T23:41:24Z",
    },
    {
      number: 8,
      name: "Run sqllogictest",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T23:41:24Z",
      completed_at: "2026-07-31T23:41:25Z",
    },
  ],
}] as WorkflowJobs;

export const log = `
2026-07-31T23:40:19.1000000Z ##[group]Run actions/checkout@3d3c42e5
2026-07-31T23:40:19.2000000Z ##[group]Run apt-get install protobuf-compiler
2026-07-31T23:40:19.3000000Z Waiting for background step(s) to complete: Run actions/checkout@3d3c42e5, Install protobuf compiler
2026-07-31T23:41:24.1000000Z Finished waiting for background step(s).
2026-07-31T23:41:24.2000000Z   Run actions/checkout@3d3c42e5: Succeeded
2026-07-31T23:41:24.3000000Z   Install protobuf compiler: Succeeded
`;
