import { assertEquals } from "@std/assert";
import { calcLayout, generateSvg, toSvgGanttJobs } from "../src/svg_gantt.ts";
import type { ganttJob } from "../src/types.ts";

// テスト用のganttJobフィクスチャ（workflow_gantt_1.test.tsと同様のデータ）
const singleSectionJobs: ganttJob[] = [
  {
    section: "run_self",
    steps: [
      {
        name: "Waiting for a runner (7s)",
        id: "job0-0",
        status: "active",
        position: "00:00:01",
        sec: 7,
      },
      {
        name: "Set up job (2s)",
        id: "job0-1",
        status: "",
        position: "after job0-0",
        sec: 2,
      },
      {
        name: "Run actions/checkout@v3 (1s)",
        id: "job0-2",
        status: "",
        position: "after job0-1",
        sec: 1,
      },
      {
        name: "Run deno task bundle (11s)",
        id: "job0-3",
        status: "",
        position: "after job0-2",
        sec: 11,
      },
    ],
  },
];

const multiSectionJobs: ganttJob[] = [
  {
    section: "build",
    steps: [
      {
        name: "Waiting for a runner (3s)",
        id: "job0-0",
        status: "active",
        position: "00:00:02",
        sec: 3,
      },
      {
        name: "Set up job (5s)",
        id: "job0-1",
        status: "",
        position: "after job0-0",
        sec: 5,
      },
    ],
  },
  {
    section: "test",
    steps: [
      {
        name: "Waiting for a runner (4s)",
        id: "job1-0",
        status: "active",
        position: "00:00:10",
        sec: 4,
      },
      {
        name: "Run tests (20s)",
        id: "job1-1",
        status: "crit",
        position: "after job1-0",
        sec: 20,
      },
    ],
  },
];

Deno.test(toSvgGanttJobs.name, async (t) => {
  await t.step("最初のステップのstartSecがHH:mm:ssから正しく変換される", () => {
    const svgJobs = toSvgGanttJobs(singleSectionJobs);
    // "00:00:01" → 1秒
    assertEquals(svgJobs[0].steps[0].startSec, 1);
  });

  await t.step("HH:mm:ssのパース（分・時間を含む場合）", () => {
    const jobs: ganttJob[] = [
      {
        section: "job",
        steps: [
          {
            name: "step",
            id: "job0-0",
            status: "",
            position: "00:01:30",
            sec: 10,
          },
        ],
      },
    ];
    const svgJobs = toSvgGanttJobs(jobs);
    // "00:01:30" → 90秒
    assertEquals(svgJobs[0].steps[0].startSec, 90);
  });

  await t.step(
    "2番目以降のステップが前ステップのstartSec + durationSecから開始する",
    () => {
      const svgJobs = toSvgGanttJobs(singleSectionJobs);
      const steps = svgJobs[0].steps;
      // job0-0: startSec=1, durationSec=7 → 終了=8
      // job0-1: "after job0-0" → startSec=8
      assertEquals(steps[1].startSec, 8);
      // job0-1: startSec=8, durationSec=2 → 終了=10
      // job0-2: "after job0-1" → startSec=10
      assertEquals(steps[2].startSec, 10);
      // job0-2: startSec=10, durationSec=1 → 終了=11
      // job0-3: "after job0-2" → startSec=11
      assertEquals(steps[3].startSec, 11);
    },
  );

  await t.step("durationSecがganttStep.secと一致する", () => {
    const svgJobs = toSvgGanttJobs(singleSectionJobs);
    const steps = svgJobs[0].steps;
    assertEquals(steps[0].durationSec, 7);
    assertEquals(steps[1].durationSec, 2);
    assertEquals(steps[2].durationSec, 1);
    assertEquals(steps[3].durationSec, 11);
  });

  await t.step("複数セクションが独立して解決される", () => {
    const svgJobs = toSvgGanttJobs(multiSectionJobs);
    // job0: "00:00:02" → 2秒
    assertEquals(svgJobs[0].steps[0].startSec, 2);
    // job0-1: "after job0-0" → 2+3=5
    assertEquals(svgJobs[0].steps[1].startSec, 5);
    // job1-0: "00:00:10" → 10秒（job0とは独立）
    assertEquals(svgJobs[1].steps[0].startSec, 10);
    // job1-1: "after job1-0" → 10+4=14
    assertEquals(svgJobs[1].steps[1].startSec, 14);
  });

  await t.step("statusとnameが正しく引き継がれる", () => {
    const svgJobs = toSvgGanttJobs(singleSectionJobs);
    assertEquals(svgJobs[0].steps[0].status, "active");
    assertEquals(svgJobs[0].steps[0].name, "Waiting for a runner (7s)");
    assertEquals(svgJobs[0].steps[1].status, "");
    assertEquals(svgJobs[0].section, "run_self");
  });
});

Deno.test(calcLayout.name, async (t) => {
  await t.step("timelineEndSecが全ステップ中の最大終了時刻になる", () => {
    const svgJobs = toSvgGanttJobs(singleSectionJobs);
    const layout = calcLayout(svgJobs);
    // 最後のstep: startSec=11, durationSec=11 → 終了=22
    assertEquals(layout.timelineEndSec, 22);
  });

  await t.step("複数セクションでの最大終了時刻", () => {
    const svgJobs = toSvgGanttJobs(multiSectionJobs);
    const layout = calcLayout(svgJobs);
    // job1-1: startSec=14, durationSec=20 → 終了=34
    assertEquals(layout.timelineEndSec, 34);
  });

  await t.step("secToPx(0) === 0", () => {
    const svgJobs = toSvgGanttJobs(singleSectionJobs);
    const layout = calcLayout(svgJobs);
    assertEquals(layout.secToPx(0), 0);
  });

  await t.step("secToPx(timelineEndSec) === chartWidth", () => {
    const svgJobs = toSvgGanttJobs(singleSectionJobs);
    const layout = calcLayout(svgJobs);
    assertEquals(layout.secToPx(layout.timelineEndSec), layout.chartWidth);
  });
});

Deno.test(generateSvg.name, async (t) => {
  const svgJobs = toSvgGanttJobs(singleSectionJobs);
  const layout = calcLayout(svgJobs);
  const svg = generateSvg("Test Workflow", svgJobs, layout);

  await t.step("<svg>タグを含む有効なSVGドキュメントが生成される", () => {
    assertEquals(svg.includes("<svg"), true);
    assertEquals(svg.includes("</svg>"), true);
    assertEquals(svg.startsWith("<svg"), true);
  });

  await t.step("タイトルがSVGに含まれる", () => {
    assertEquals(svg.includes("Test Workflow"), true);
  });

  await t.step("各セクション名がSVGに含まれる", () => {
    assertEquals(svg.includes("run_self"), true);
  });

  await t.step("statusに対応するfill色が含まれる", () => {
    // active → #1f6feb (blue)
    assertEquals(svg.includes("#1f6feb"), true);
    // success ("") → #2da44e (green)
    assertEquals(svg.includes("#2da44e"), true);
  });

  await t.step("critステータスの色が含まれる", () => {
    const jobsWithCrit = toSvgGanttJobs(multiSectionJobs);
    const layoutWithCrit = calcLayout(jobsWithCrit);
    const svgWithCrit = generateSvg("Test", jobsWithCrit, layoutWithCrit);
    // crit → #da3633 (red)
    assertEquals(svgWithCrit.includes("#da3633"), true);
  });

  await t.step("doneステータスの色が含まれる", () => {
    const doneJobs: ganttJob[] = [
      {
        section: "job",
        steps: [
          {
            name: "skipped (0s)",
            id: "job0-0",
            status: "done",
            position: "00:00:01",
            sec: 5,
          },
        ],
      },
    ];
    const donesvgJobs = toSvgGanttJobs(doneJobs);
    const doneLayout = calcLayout(donesvgJobs);
    const doneSvg = generateSvg("Test", donesvgJobs, doneLayout);
    // done → #8b949e (gray)
    assertEquals(doneSvg.includes("#8b949e"), true);
  });

  await t.step("ステップ名がSVGに含まれる", () => {
    assertEquals(svg.includes("Waiting for a runner (7s)"), true);
    assertEquals(svg.includes("Set up job (2s)"), true);
  });
});
