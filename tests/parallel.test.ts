import {
  ok as assert,
  deepStrictEqual as assertEquals,
} from "node:assert/strict";
import { test } from "node:test";
import type { WorkflowJobStep } from "../src/github/github.ts";
import { expandJobSteps } from "../src/logic/composite.ts";
import {
  expandParallelJobSteps,
  expandParallelSteps,
} from "../src/logic/parallel.ts";
import { buildHtmlReportData } from "../src/output/html/report.ts";
import { createMermaid } from "../src/output/mermaid/workflow_gantt.ts";
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

const createStep = (
  number: number,
  name: string,
  overrides: Partial<WorkflowJobStep> = {},
): WorkflowJobStep => ({
  number,
  name,
  status: "completed",
  conclusion: "success",
  started_at: "2026-07-31T21:55:20Z",
  completed_at: "2026-07-31T21:56:21Z",
  ...overrides,
});

const createParent = (number: number): WorkflowJobStep =>
  createStep(number, "Parallel group", {
    completed_at: "2026-07-31T21:57:30Z",
  });

const createMarker = (names: string): string =>
  `2026-07-31T21:55:20.5000000Z Waiting for background step(s) to complete: ${names}`;

const skipped = {
  conclusion: "skipped",
  started_at: null,
  completed_at: "2026-07-31T21:55:20Z",
} satisfies Partial<WorkflowJobStep>;

test(expandParallelJobSteps.name, async (t) => {
  await t.test("renders the Nuxt typecheck steps in parallel", () => {
    const result = expandParallelJobSteps(nuxtJobs[0].steps!, nuxtLog);
    assertEquals(result.warning, undefined);

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
      createMermaid(
        nuxtWorkflow,
        [
          {
            ...nuxtJobs[0],
            steps: result.steps,
          },
        ],
        {},
      ),
      expected,
    );
  });

  await t.test("renders action and run children in parallel", () => {
    const result = expandParallelJobSteps(
      datafusionJobs[0].steps!,
      datafusionLog,
    );
    assertEquals(result.warning, undefined);

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
      createMermaid(
        datafusionWorkflow,
        [
          {
            ...datafusionJobs[0],
            steps: result.steps,
          },
        ],
        {},
      ),
      expected,
    );
  });

  await t.test("keeps the original steps when the log does not match", () => {
    const result = expandParallelJobSteps(nuxtJobs[0].steps!, "");
    assertEquals(result.steps, nuxtJobs[0].steps);
    assertEquals(
      result.warning,
      "Could not correlate parallel groups between API steps and logs",
    );
  });

  await t.test("ignores a user step named Parallel group", () => {
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

  await t.test("falls back when a logged group has no API candidate", () => {
    const steps = nuxtJobs[0].steps!.filter(
      (step) => step.name !== "Parallel group",
    );

    const result = expandParallelJobSteps(steps, nuxtLog);

    assertEquals(result.steps, steps);
    assertEquals(
      result.warning,
      "Could not correlate parallel groups between API steps and logs",
    );
  });

  await t.test("excludes a preceding fast step from parallel children", () => {
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

  await t.test("allows a parallel child named Parallel group", () => {
    const steps = nuxtJobs[0].steps!.map((step) =>
      step.name === "Typecheck (docs)"
        ? { ...step, name: "Parallel group" }
        : step,
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

  await t.test(
    "expands skipped children and preserves one-second start differences",
    () => {
      const steps = [
        createStep(1, "Fast preceding step", {
          started_at: "2026-07-31T21:55:19Z",
          completed_at: "2026-07-31T21:55:19Z",
        }),
        createStep(2, "Skipped preceding step", skipped),
        createStep(3, "Check", {
          started_at: "2026-07-31T21:55:19Z",
        }),
        createStep(4, "Skipped null", skipped),
        createStep(5, "Skipped sentinel", {
          ...skipped,
          started_at: "0001-01-01T00:00:00Z",
        }),
        createStep(6, "Build", {
          started_at: "2026-07-31T21:55:21Z",
        }),
        createParent(7),
      ];
      const result = expandParallelJobSteps(
        steps,
        createMarker("Check, __parallel_0_1, __parallel_0_2, Build"),
      );

      assertEquals(result.warning, undefined);
      assertEquals(
        result.steps.map((step) => [step.name, step.started_at]),
        [
          ["Fast preceding step", "2026-07-31T21:55:19Z"],
          ["Skipped preceding step", null],
          ["Parallel group", "2026-07-31T21:55:20Z"],
          ["(bg) Check", "2026-07-31T21:55:19Z"],
          ["(bg) Skipped null", null],
          ["(bg) Skipped sentinel", "0001-01-01T00:00:00Z"],
          ["(bg) Build", "2026-07-31T21:55:21Z"],
        ],
      );

      const jobs = [{ ...nuxtJobs[0], steps: result.steps }];
      const mermaid = createMermaid(nuxtWorkflow, jobs, {
        showWaitingRunner: false,
      });
      assert(
        mermaid.includes(
          "(skipped) (bg) Skipped null (0s) :done, job0-4, 00:00:39, 0s",
        ),
      );
      assert(
        mermaid.includes(
          "(skipped) (bg) Skipped sentinel (0s) :done, job0-5, 00:00:39, 0s",
        ),
      );
      assert(mermaid.includes("(bg) Check (1m2s) :job0-3, 00:00:38, 62s"));
      assert(mermaid.includes("(bg) Build (1m0s) :job0-6, 00:00:40, 60s"));

      const parallel = buildHtmlReportData(
        nuxtWorkflow,
        jobs,
      ).jobs[0].items.find((item) => item.kind === "parallel");
      assert(parallel);
      assertEquals(
        parallel.children
          .filter((child) => child.conclusion === "skipped")
          .map(({ name, start, end, dur, isCp }) => [
            name,
            start,
            end,
            dur,
            isCp,
          ]),
        [
          ["Skipped null", null, null, 0, false],
          ["Skipped sentinel", null, null, 0, false],
        ],
      );
    },
  );

  await t.test(
    "matches adjacent groups with identical child names one-to-one",
    () => {
      const steps = [
        createStep(1, "Fast preceding step", {
          completed_at: "2026-07-31T21:55:20Z",
        }),
        createStep(2, "Skipped preceding step", skipped),
        createStep(3, "Run, with comma"),
        createStep(4, "Skipped child", skipped),
        createStep(5, "Duplicate"),
        createStep(6, "Duplicate"),
        createParent(7),
        createStep(8, "Run, with comma"),
        createStep(9, "Skipped child", skipped),
        createStep(10, "Duplicate"),
        createStep(11, "Duplicate"),
        createParent(12),
      ];
      const markers = [
        createMarker("Run, with comma, __parallel_0_1, Duplicate, Duplicate"),
        createMarker("Run, with comma, __parallel_1_1, Duplicate, Duplicate"),
      ];
      const result = expandParallelJobSteps(steps, markers.join("\n"));

      assertEquals(result.warning, undefined);
      assertEquals(
        result.steps.map((step) => [step.name, step.timelineRowKind]),
        [
          ["Fast preceding step", undefined],
          ["Skipped preceding step", undefined],
          ["Parallel group", "parallel-parent"],
          ["(bg) Run, with comma", "parallel-child"],
          ["(bg) Skipped child", "parallel-child"],
          ["(bg) Duplicate", "parallel-child"],
          ["(bg) Duplicate", "parallel-child"],
          ["Parallel group", "parallel-parent"],
          ["(bg) Run, with comma", "parallel-child"],
          ["(bg) Skipped child", "parallel-child"],
          ["(bg) Duplicate", "parallel-child"],
          ["(bg) Duplicate", "parallel-child"],
        ],
      );

      const allRunSteps = steps.map((step) =>
        step.name === "Skipped child"
          ? {
              ...step,
              conclusion: "success",
              started_at: "2026-07-31T21:55:20Z",
            }
          : step,
      );
      const identicalMarker = createMarker(
        "Run, with comma, Skipped child, Duplicate, Duplicate",
      );
      const identicalResult = expandParallelJobSteps(
        allRunSteps,
        [identicalMarker, identicalMarker].join("\n"),
      );
      assertEquals(identicalResult.warning, undefined);
      assertEquals(
        identicalResult.steps.filter(
          (step) => step.timelineRowKind === "parallel-parent",
        ).length,
        2,
      );

      const missingMarker = expandParallelJobSteps(
        allRunSteps,
        identicalMarker,
      );
      assertEquals(missingMarker.steps, allRunSteps);
      assertEquals(
        missingMarker.warning,
        "Could not correlate parallel groups between API steps and logs",
      );
    },
  );

  await t.test(
    "expands an all-skipped group without absorbing an outside skip",
    () => {
      const steps = [
        createStep(1, "Outside skip", skipped),
        createStep(2, "First skipped", skipped),
        createStep(3, "Second skipped", skipped),
        createParent(4),
      ];
      const result = expandParallelJobSteps(
        steps,
        createMarker("__parallel_0_0, __parallel_0_1"),
      );

      assertEquals(result.warning, undefined);
      assertEquals(
        result.steps.map((step) => [step.name, step.timelineRowKind]),
        [
          ["Outside skip", undefined],
          ["Parallel group", "parallel-parent"],
          ["(bg) First skipped", "parallel-child"],
          ["(bg) Second skipped", "parallel-child"],
        ],
      );
    },
  );

  await t.test(
    "allows a child and a following step named Parallel group",
    () => {
      const steps = [
        createStep(1, "Set up job", {
          completed_at: "2026-07-31T21:55:20Z",
        }),
        createStep(2, "Parallel group"),
        createStep(3, "Skipped child", skipped),
        createParent(4),
        createStep(5, "Parallel group", {
          completed_at: "2026-07-31T21:57:30Z",
        }),
      ];
      const result = expandParallelJobSteps(
        steps,
        createMarker("Parallel group, __parallel_0_1"),
      );

      assertEquals(result.warning, undefined);
      assertEquals(
        result.steps.map((step) => [step.name, step.timelineRowKind]),
        [
          ["Set up job", undefined],
          ["Parallel group", "parallel-parent"],
          ["(bg) Parallel group", "parallel-child"],
          ["(bg) Skipped child", "parallel-child"],
          ["Parallel group", undefined],
        ],
      );
    },
  );

  await t.test(
    "rejects malformed, missing, extra, and custom-id markers",
    () => {
      const steps = [
        createStep(1, "Check"),
        createStep(2, "Skipped child", skipped),
        createParent(3),
      ];
      const valid = createMarker("Check, __parallel_0_1");
      const logs = [
        "",
        createMarker("Check, __parallel_1_1"),
        createMarker("Check, __parallel_0_0"),
        createMarker("__parallel_0_0, __parallel_0_1"),
        createMarker("Check, custom_skip_id"),
        [valid, valid].join("\n"),
        [valid, createMarker("extra")].join("\n"),
      ];

      assertEquals(
        logs.map((log) => {
          const result = expandParallelJobSteps(steps, log);
          return [result.warning, result.steps === steps];
        }),
        logs.map(() => [
          "Could not correlate parallel groups between API steps and logs",
          true,
        ]),
      );
    },
  );

  await t.test(
    "accepts real names that resemble generated placeholders",
    () => {
      const steps = [
        createStep(1, "__parallel_99_9"),
        createStep(2, "__parallel_5_0", skipped),
        createParent(3),
      ];
      const result = expandParallelJobSteps(
        steps,
        createMarker("__parallel_99_9, __parallel_5_0"),
      );

      assertEquals(result.warning, undefined);
      assertEquals(
        result.steps.map((step) => step.name),
        ["Parallel group", "(bg) __parallel_99_9", "(bg) __parallel_5_0"],
      );
    },
  );

  await t.test("rejects ambiguous suffixes instead of guessing", () => {
    const steps = [
      createStep(1, "A"),
      createStep(2, "A, __parallel_0_1", skipped),
      createParent(3),
    ];
    const result = expandParallelJobSteps(
      steps,
      createMarker("A, __parallel_0_1"),
    );

    assertEquals(result.steps, steps);
    assertEquals(
      result.warning,
      "Could not correlate parallel groups between API steps and logs",
    );
  });

  await t.test("rejects children outside the time and end-time checks", () => {
    const parent = createParent(3);
    const logs = createMarker("Check, __parallel_0_1");
    const variants = [
      [
        createStep(1, "Check", { started_at: "2026-07-31T21:55:18Z" }),
        createStep(2, "Skipped child", skipped),
        parent,
      ],
      [
        createStep(1, "Check", { started_at: "2026-07-31T21:55:22Z" }),
        createStep(2, "Skipped child", skipped),
        parent,
      ],
      [
        createStep(1, "Check", { completed_at: "2026-07-31T21:57:31Z" }),
        createStep(2, "Skipped child", skipped),
        parent,
      ],
      [
        createStep(1, "Check"),
        createStep(2, "Skipped child", {
          ...skipped,
          completed_at: "2026-07-31T21:57:31Z",
        }),
        parent,
      ],
    ];

    assertEquals(
      variants.map((steps) => {
        const result = expandParallelJobSteps(steps, logs);
        return [result.warning, result.steps === steps];
      }),
      variants.map(() => [
        "Could not correlate parallel groups between API steps and logs",
        true,
      ]),
    );
  });

  await t.test("rejects markers outside the parent time window", () => {
    const steps = [
      createStep(1, "Check"),
      createStep(2, "Skipped child", skipped),
      createParent(3),
    ];
    const markers = [
      "2026-07-31T21:55:19.999Z Waiting for background step(s) to complete: Check, __parallel_0_1",
      "2026-07-31T21:57:31.001Z Waiting for background step(s) to complete: Check, __parallel_0_1",
    ];

    assertEquals(
      markers.map((marker) => {
        const result = expandParallelJobSteps(steps, marker);
        return [result.warning, result.steps === steps];
      }),
      markers.map(() => [
        "Could not correlate parallel groups between API steps and logs",
        true,
      ]),
    );
  });

  await t.test("styles only a failed child as critical", () => {
    const failedSteps = nuxtJobs[0].steps!.map((step) =>
      step.name === "Test (types)" || step.name === "Parallel group"
        ? { ...step, conclusion: "failure" }
        : step,
    );
    const result = expandParallelJobSteps(failedSteps, nuxtLog);
    const mermaid = createMermaid(
      nuxtWorkflow,
      [
        {
          ...nuxtJobs[0],
          steps: result.steps,
        },
      ],
      {},
    );

    assert(mermaid.includes("Parallel group (2m10s) :job0-3, 00:00:39, 130s"));
    assert(
      mermaid.includes("(bg) Test (types) (1m1s) :crit, job0-4, 00:00:39, 61s"),
    );
  });

  await t.test("preserves parallel rows during composite expansion", () => {
    const compositeName = "Run ./.github/actions/setup";
    const stepsWithComposite = datafusionJobs[0].steps!.map((step) =>
      step.name === "Run actions/checkout@3d3c42e5"
        ? { ...step, name: compositeName }
        : step,
    );
    const parallelResult = expandParallelJobSteps(
      stepsWithComposite,
      datafusionLog.replace(/Run actions\/checkout@3d3c42e5/g, compositeName),
    );
    const compositeIndex = parallelResult.steps.findIndex(
      (step) => step.timelineOriginalName === compositeName,
    );
    const compositeStep = parallelResult.steps[compositeIndex];

    const expanded = expandJobSteps(
      parallelResult.steps,
      [
        {
          apiStepIndex: compositeIndex,
          apiStepName: compositeStep.name,
          usesPath: "./.github/actions/setup",
          logHeaderOccurrence: 0,
          status: compositeStep.status,
          conclusion: compositeStep.conclusion,
        },
      ],
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

  await t.test("starts each background composite child independently", () => {
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
    const mermaid = createMermaid(
      datafusionWorkflow,
      [
        {
          ...datafusionJobs[0],
          steps,
        },
      ],
      { showWaitingRunner: false },
    );

    assert(mermaid.includes("(sub) setup one (1s) :job0-2, 00:00:40, 1s"));
    assert(mermaid.includes("(sub) setup two (2s) :job0-4, 00:00:40, 2s"));
  });
});

test(expandParallelSteps.name, async () => {
  const jobs = [
    ...nuxtJobs,
    {
      ...datafusionJobs[0],
      id: 2,
      name: "log unavailable",
    },
  ];
  const client = {
    fetchJobLog: (_owner: string, _repo: string, jobId: number) =>
      jobId === 2
        ? Promise.reject(new Error("HTTP 403"))
        : Promise.resolve(nuxtLog),
  };

  const result = await expandParallelSteps(client, nuxtWorkflow, jobs);

  assertEquals(
    result.jobs[0].steps?.map((step) => [step.name, step.timelineRowKind]),
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
  assertEquals(result.warnings, [
    {
      jobId: 2,
      jobName: "log unavailable",
      reason: "Could not download the job log: HTTP 403",
    },
  ]);
});
