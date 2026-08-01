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
    assertEquals(
      result.warning,
      "Could not correlate parallel groups between API steps and logs",
    );
  });

  await t.step("ignores a user step named Parallel group", () => {
    const userStep = {
      ...nuxtJobs[0].steps![0],
      name: "Parallel group",
      started_at: "2026-07-31T21:57:31Z",
      completed_at: "2026-07-31T21:57:32Z",
    };
    const steps = [...nuxtJobs[0].steps!, userStep];

    const result = expandParallelJobSteps(steps, nuxtLog);

    assertEquals(result.warning, undefined);
    assertEquals(result.steps.at(-1), userStep);
  });

  await t.step("falls back when a logged group has no API candidate", () => {
    const steps = nuxtJobs[0].steps!.filter((step) =>
      step.name !== "Parallel group"
    );

    const result = expandParallelJobSteps(steps, nuxtLog);

    assertEquals(result.steps, steps);
    assertEquals(
      result.warning,
      "Could not correlate parallel groups between API steps and logs",
    );
  });

  await t.step("excludes a preceding fast step from parallel children", () => {
    const fastStep = {
      ...nuxtJobs[0].steps![0],
      number: 3,
      name: "Fast top-level step",
      started_at: "2026-07-31T21:55:20Z",
      completed_at: "2026-07-31T21:55:20Z",
    };
    const steps = [
      ...nuxtJobs[0].steps!.slice(0, 2),
      fastStep,
      ...nuxtJobs[0].steps!.slice(2),
    ];

    const result = expandParallelJobSteps(steps, nuxtLog);

    assertEquals(result.warning, undefined);
    assertEquals(
      result.steps.map((step) => step.name),
      [
        "Set up job",
        "Run voidzero-dev/setup-vp@250f29ce",
        "Fast top-level step",
        "Parallel group",
        "(bg) Test (types)",
        "(bg) Typecheck (docs)",
        "Cancel workflow on failure",
      ],
    );
  });

  await t.step("allows a parallel child named Parallel group", () => {
    const steps = nuxtJobs[0].steps!.map((step) =>
      step.name === "Typecheck (docs)"
        ? { ...step, name: "Parallel group" }
        : step
    );
    const log = nuxtLog.replace(
      /Test \(types\), Typecheck \(docs\)/,
      "Test (types), Parallel group",
    );

    const result = expandParallelJobSteps(steps, log);

    assertEquals(result.warning, undefined);
    assertEquals(
      result.steps.map((step) => step.name),
      [
        "Set up job",
        "Run voidzero-dev/setup-vp@250f29ce",
        "Parallel group",
        "(bg) Test (types)",
        "(bg) Parallel group",
        "Cancel workflow on failure",
      ],
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
    const compositeName = "Run ./.github/actions/setup";
    const stepsWithComposite = datafusionJobs[0].steps!.map((step) =>
      step.name === "Run actions/checkout@3d3c42e5"
        ? { ...step, name: compositeName }
        : step
    );
    const parallelResult = expandParallelJobSteps(
      stepsWithComposite,
      datafusionLog.replace(
        /Run actions\/checkout@3d3c42e5/g,
        compositeName,
      ),
    );
    const compositeIndex = parallelResult.steps.findIndex(
      (step) => step.timelineOriginalName === compositeName,
    );
    const compositeStep = parallelResult.steps[compositeIndex];

    const expanded = expandJobSteps(
      parallelResult.steps,
      [{
        apiStepIndex: compositeIndex,
        apiStepName: compositeStep.name,
        usesPath: "./.github/actions/setup",
        logHeaderOccurrence: 0,
        status: compositeStep.status,
        conclusion: compositeStep.conclusion,
      }],
      new Map([["./.github/actions/setup", 1]]),
      [
        {
          name: "Run ./.github/actions/setup",
          startedAt: new Date("2026-07-31T23:40:19Z"),
        },
        {
          name: "Run echo setup",
          startedAt: new Date("2026-07-31T23:40:20Z"),
        },
      ],
    );

    assertEquals(
      expanded.map((step) => [step.name, step.timelineRowKind]),
      [
        ["Set up job", undefined],
        ["Run runs-on/action@4e5f7239", undefined],
        ["Parallel group", "parallel-parent"],
        ["(bg) Run ./.github/actions/setup", "parallel-child"],
        ["(sub) echo setup", "composite-child"],
        ["(bg) Install protobuf compiler", "parallel-child"],
        ["Run sqllogictest", undefined],
      ],
    );
  });

  await t.step("starts each background composite child independently", () => {
    const steps = [
      {
        ...datafusionJobs[0].steps![4],
        timelineRowKind: "parallel-parent" as const,
      },
      {
        ...datafusionJobs[0].steps![2],
        name: "(bg) Run ./.github/actions/setup-one",
        timelineRowKind: "parallel-child" as const,
      },
      {
        ...datafusionJobs[0].steps![2],
        name: "(sub) setup one",
        started_at: "2026-07-31T23:40:20Z",
        completed_at: "2026-07-31T23:40:21Z",
        timelineRowKind: "composite-child" as const,
      },
      {
        ...datafusionJobs[0].steps![3],
        name: "(bg) Run ./.github/actions/setup-two",
        timelineRowKind: "parallel-child" as const,
      },
      {
        ...datafusionJobs[0].steps![3],
        name: "(sub) setup two",
        started_at: "2026-07-31T23:40:20Z",
        completed_at: "2026-07-31T23:40:22Z",
        timelineRowKind: "composite-child" as const,
      },
    ];
    const mermaid = createMermaid(datafusionWorkflow, [{
      ...datafusionJobs[0],
      steps,
    }], { showWaitingRunner: false });

    assertStringIncludes(
      mermaid,
      "(sub) setup one (1s) :job0-2, 00:00:40, 1s",
    );
    assertStringIncludes(
      mermaid,
      "(sub) setup two (2s) :job0-4, 00:00:40, 2s",
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
