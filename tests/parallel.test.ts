import { assertEquals, assertStringIncludes } from "@std/assert";
import { expandJobSteps } from "../src/composite.ts";
import { createMermaid } from "../src/workflow_gantt.ts";
import {
  expandParallelJobSteps,
  expandParallelSteps,
} from "../src/parallel.ts";
import {
  jobs as datafusionJobs,
  log as datafusionLog,
  workflow as datafusionWorkflow,
} from "./fixture/parallel_datafusion.ts";
import {
  jobs as nuxtJobs,
  log as nuxtLog,
  workflow as nuxtWorkflow,
} from "./fixture/parallel_nuxt.ts";

Deno.test(expandParallelJobSteps.name, async (t) => {
  await t.step("renders the Nuxt typecheck steps in parallel", () => {
    const result = expandParallelJobSteps(nuxtJobs[0].steps!, nuxtLog);
    assertEquals(result.warning, undefined);

    // deno-fmt-ignore
    const expected = `
\`\`\`mermaid
gantt
title ci
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section typecheck (ubuntu-24.04-arm, bundler)
Waiting for a runner (4s) :active, job0-0, 00:00:11, 4s
Set up job (1s) :job0-1, after job0-0, 1s
Run voidzero-dev/setup-vp@250f29ce (23s) :job0-2, after job0-1, 23s
Parallel group (2m10s) :job0-3, 00:00:39, 130s
(bg) Test (types) (1m1s) :job0-4, 00:00:39, 61s
(bg) Typecheck (docs) (2m10s) :job0-5, 00:00:39, 130s
Cancel workflow on failure (0s) :done, job0-6, after job0-3, 0s
\`\`\``;

    assertEquals(
      createMermaid(nuxtWorkflow, [{
        ...nuxtJobs[0],
        steps: result.steps,
      }], {}),
      expected,
    );
  });

  await t.step("renders action and run children in parallel", () => {
    const result = expandParallelJobSteps(
      datafusionJobs[0].steps!,
      datafusionLog,
    );
    assertEquals(result.warning, undefined);

    // deno-fmt-ignore
    const expected = `
\`\`\`mermaid
gantt
title Datafusion extended tests
dateFormat  HH:mm:ss
axisFormat  %H:%M:%S
section Run sqllogictests with the sqlite test suite
Waiting for a runner (21s) :active, job0-0, 00:00:01, 21s
Set up job (1s) :job0-1, after job0-0, 1s
Run runs-on/action@4e5f7239 (16s) :job0-2, after job0-1, 16s
Parallel group (1m5s) :job0-3, 00:00:39, 65s
(bg) Run actions/checkout@3d3c42e5 (1m5s) :job0-4, 00:00:39, 65s
(bg) Install protobuf compiler (3s) :job0-5, 00:00:39, 3s
Run sqllogictest (1s) :job0-6, after job0-3, 1s
\`\`\``;

    assertEquals(
      createMermaid(datafusionWorkflow, [{
        ...datafusionJobs[0],
        steps: result.steps,
      }], {}),
      expected,
    );
  });

  await t.step("keeps the original steps when the log does not match", () => {
    const result = expandParallelJobSteps(nuxtJobs[0].steps!, "");
    assertEquals(result.steps, nuxtJobs[0].steps);
    assertStringIncludes(
      result.warning!,
      "Could not match API steps for parallel group",
    );
  });

  await t.step("styles only a failed child as critical", () => {
    const failedSteps = nuxtJobs[0].steps!.map((step) =>
      step.name === "Test (types)" || step.name === "Parallel group"
        ? { ...step, conclusion: "failure" }
        : step
    );
    const result = expandParallelJobSteps(failedSteps, nuxtLog);
    const mermaid = createMermaid(nuxtWorkflow, [{
      ...nuxtJobs[0],
      steps: result.steps,
    }], {});

    assertStringIncludes(
      mermaid,
      "Parallel group (2m10s) :job0-3, 00:00:39, 130s",
    );
    assertStringIncludes(
      mermaid,
      "(bg) Test (types) (1m1s) :crit, job0-4, 00:00:39, 61s",
    );
  });

  await t.step("preserves parallel rows during composite expansion", () => {
    const parallelResult = expandParallelJobSteps(
      nuxtJobs[0].steps!,
      nuxtLog,
    );
    const compositeStep = {
      number: 8,
      name: "Run ./.github/actions/setup",
      status: "completed",
      conclusion: "success",
      started_at: "2026-07-31T21:57:30Z",
      completed_at: "2026-07-31T21:57:40Z",
    };
    const steps = [...parallelResult.steps, compositeStep];
    const compositeIndex = steps.length - 1;

    const expanded = expandJobSteps(
      steps,
      [{
        apiStepIndex: compositeIndex,
        apiStepName: compositeStep.name,
        usesPath: "./.github/actions/setup",
        status: compositeStep.status,
        conclusion: compositeStep.conclusion,
      }],
      new Map([["./.github/actions/setup", 1]]),
      [
        {
          name: "Run ./.github/actions/setup",
          startedAt: new Date("2026-07-31T21:57:30Z"),
        },
        {
          name: "Run echo setup",
          startedAt: new Date("2026-07-31T21:57:31Z"),
        },
      ],
    );

    assertEquals(
      expanded.map((step) => [step.name, step.timelineRowKind]),
      [
        ["Set up job", undefined],
        ["Run voidzero-dev/setup-vp@250f29ce", undefined],
        ["Parallel group", "parallel-parent"],
        ["(bg) Test (types)", "parallel-child"],
        ["(bg) Typecheck (docs)", "parallel-child"],
        ["Cancel workflow on failure", undefined],
        ["Run ./.github/actions/setup", undefined],
        ["(sub) echo setup", "composite-child"],
      ],
    );
  });
});

Deno.test(expandParallelSteps.name, async () => {
  const jobs = [...nuxtJobs, {
    ...datafusionJobs[0],
    id: 2,
    name: "log unavailable",
  }];
  const client = {
    fetchJobLog: (_owner: string, _repo: string, jobId: number) =>
      jobId === 2
        ? Promise.reject(new Error("HTTP 403"))
        : Promise.resolve(nuxtLog),
  };

  const result = await expandParallelSteps(client, nuxtWorkflow, jobs);

  assertEquals(
    result.jobs[0].steps?.map((step) => [
      step.name,
      step.timelineRowKind,
    ]),
    [
      ["Set up job", undefined],
      ["Run voidzero-dev/setup-vp@250f29ce", undefined],
      ["Parallel group", "parallel-parent"],
      ["(bg) Test (types)", "parallel-child"],
      ["(bg) Typecheck (docs)", "parallel-child"],
      ["Cancel workflow on failure", undefined],
    ],
  );
  assertEquals(result.jobs[1], jobs[1]);
  assertEquals(result.warnings, [{
    jobId: 2,
    jobName: "log unavailable",
    reason: "Could not download the job log: HTTP 403",
  }]);
});
