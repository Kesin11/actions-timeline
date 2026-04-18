import { formatShortElapsedTime } from "./format_util.ts";
import type { ganttJob, SvgGanttJob, SvgGanttStep } from "./types.ts";

// ステータス → SVG fill色のマッピング（GitHub UIに準拠した配色）
const STATUS_COLORS: Record<SvgGanttStep["status"], string> = {
  "": "#2da44e", // success: GitHub green
  "done": "#8b949e", // skipped/cancelled: gray
  "active": "#1f6feb", // in-progress: blue
  "crit": "#da3633", // failure: red
};

// SVGレイアウト定数
const SVG_WIDTH = 1200;
const LABEL_WIDTH = 220; // ステップラベル列の幅
const CHART_LEFT = LABEL_WIDTH + 8; // チャート描画開始X座標
const CHART_WIDTH = SVG_WIDTH - CHART_LEFT - 12; // チャート領域の幅
const TITLE_HEIGHT = 36;
const AXIS_HEIGHT = 28;
const SECTION_HEADER_HEIGHT = 22;
const ROW_HEIGHT = 22;
const BAR_HEIGHT = 16;
const BAR_PADDING_Y = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const CONTENT_TOP = TITLE_HEIGHT + AXIS_HEIGHT;

// "HH:mm:ss" → 秒数（formatElapsedTime の逆関数）
function parseTimeToSec(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

// XML特殊文字をエスケープする
function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * ganttJob[] → SvgGanttJob[]
 * ganttStep.position（Mermaid固有のフォーマット）を絶対秒数に解決する。
 *
 * position のフォーマット:
 * - 各ジョブの最初のステップ: "HH:mm:ss"（ワークフロー開始からの絶対経過秒数）
 * - 2番目以降のステップ: "after job{i}-{j}"（前ステップからの相対参照）
 */
export function toSvgGanttJobs(ganttJobs: ganttJob[]): SvgGanttJob[] {
  // ステップIDをキー、{startSec, durationSec}を値とするMap
  const resolvedMap = new Map<
    string,
    { startSec: number; durationSec: number }
  >();

  return ganttJobs.map((job): SvgGanttJob => {
    const steps = job.steps.map((step): SvgGanttStep => {
      const durationSec = step.sec;
      let startSec: number;

      if (step.position.startsWith("after ")) {
        // "after job{i}-{j}" → 参照先ステップの終了時刻
        const refId = step.position.slice("after ".length);
        const ref = resolvedMap.get(refId);
        startSec = ref ? ref.startSec + ref.durationSec : 0;
      } else {
        // "HH:mm:ss" → 絶対秒数
        startSec = parseTimeToSec(step.position);
      }

      resolvedMap.set(step.id, { startSec, durationSec });

      return {
        name: step.name,
        id: step.id,
        status: step.status,
        startSec,
        durationSec,
      };
    });

    return { section: job.section, steps };
  });
}

export type SvgLayout = {
  totalWidthPx: number;
  totalHeightPx: number;
  chartLeft: number;
  chartWidth: number;
  timelineEndSec: number;
  rowHeight: number;
  sectionHeaderHeight: number;
  contentTop: number;
  secToPx: (sec: number) => number;
};

/**
 * SVGレイアウトの座標計算値を算出する。
 */
export function calcLayout(svgJobs: SvgGanttJob[]): SvgLayout {
  // 全ステップの終了時刻の最大値（横軸の終端）
  const timelineEndSec = svgJobs.reduce((maxEnd, job) => {
    return job.steps.reduce((m, step) => {
      return Math.max(m, step.startSec + step.durationSec);
    }, maxEnd);
  }, 0);

  // 全体の高さ = タイトル + 軸 + 各セクション
  const totalRows = svgJobs.reduce(
    (sum, job) => sum + 1 + job.steps.length, // 1 = セクションヘッダー行
    0,
  );
  const totalHeightPx = CONTENT_TOP + totalRows * ROW_HEIGHT + 16;

  const secToPx = (sec: number): number =>
    timelineEndSec > 0 ? (sec / timelineEndSec) * CHART_WIDTH : 0;

  return {
    totalWidthPx: SVG_WIDTH,
    totalHeightPx,
    chartLeft: CHART_LEFT,
    chartWidth: CHART_WIDTH,
    timelineEndSec,
    rowHeight: ROW_HEIGHT,
    sectionHeaderHeight: SECTION_HEADER_HEIGHT,
    contentTop: CONTENT_TOP,
    secToPx,
  };
}

// 時間軸の目盛り間隔（秒）を求める
function calcTickIntervalSec(totalSec: number): number {
  if (totalSec <= 60) return 10;
  if (totalSec <= 300) return 30;
  if (totalSec <= 600) return 60;
  if (totalSec <= 1800) return 120;
  if (totalSec <= 3600) return 300;
  return 600;
}

function generateTitle(title: string): string {
  const x = SVG_WIDTH / 2;
  const y = TITLE_HEIGHT - 8;
  return `<text x="${x}" y="${y}" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#24292f">${
    escapeXml(title)
  }</text>`;
}

function generateAxis(layout: SvgLayout): string {
  const { timelineEndSec, secToPx } = layout;
  const axisY = TITLE_HEIGHT + AXIS_HEIGHT - 1;
  const intervalSec = calcTickIntervalSec(timelineEndSec);

  const parts: string[] = [];

  // 軸の横線
  parts.push(
    `<line x1="${CHART_LEFT}" y1="${axisY}" x2="${
      SVG_WIDTH - 12
    }" y2="${axisY}" stroke="#d0d7de" stroke-width="1"/>`,
  );

  // 目盛りと時間ラベル
  for (let sec = 0; sec <= timelineEndSec; sec += intervalSec) {
    const x = CHART_LEFT + secToPx(sec);
    const label = sec === 0 ? "0s" : formatShortElapsedTime(sec);

    // 目盛り線（軸ラインから下に伸びる）
    parts.push(
      `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${
        axisY + 4
      }" stroke="#57606a" stroke-width="1"/>`,
    );
    // 時間ラベル（目盛り線の上）
    parts.push(
      `<text x="${x}" y="${
        axisY - 4
      }" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#57606a">${
        escapeXml(label)
      }</text>`,
    );
    // チャートエリアへの縦のガイドライン
    if (sec > 0) {
      parts.push(
        `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${
          layout.totalHeightPx - 8
        }" stroke="#d0d7de" stroke-width="1" stroke-dasharray="2,2"/>`,
      );
    }
  }

  return parts.join("\n");
}

function generateSectionLabel(name: string, y: number): string {
  const labelY = y + SECTION_HEADER_HEIGHT / 2;
  return [
    `<rect x="0" y="${y}" width="${SVG_WIDTH}" height="${SECTION_HEADER_HEIGHT}" fill="#f6f8fa"/>`,
    `<text x="${
      CHART_LEFT - 4
    }" y="${labelY}" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="end" dominant-baseline="middle" fill="#24292f">${
      escapeXml(name)
    }</text>`,
  ].join("\n");
}

function generateBar(
  step: SvgGanttStep,
  rowY: number,
  layout: SvgLayout,
): string {
  const { secToPx } = layout;
  const x = CHART_LEFT + secToPx(step.startSec);
  const w = Math.max(secToPx(step.durationSec), 2); // 最小幅2px
  const y = rowY + BAR_PADDING_Y;
  const fill = STATUS_COLORS[step.status];

  const labelX = CHART_LEFT - 4;
  const labelY = rowY + ROW_HEIGHT / 2;

  return [
    // ステップ名ラベル（左側）
    `<text x="${labelX}" y="${labelY}" font-family="monospace" font-size="11" text-anchor="end" dominant-baseline="middle" fill="#57606a">${
      escapeXml(step.name)
    }</text>`,
    // ガントバー
    `<rect x="${x}" y="${y}" width="${w}" height="${BAR_HEIGHT}" fill="${fill}" rx="3"/>`,
  ].join("\n");
}

/**
 * SVGのガントチャート文字列を生成するエントリポイント。
 */
export function generateSvg(
  title: string,
  svgJobs: SvgGanttJob[],
  layout: SvgLayout,
): string {
  const { totalWidthPx, totalHeightPx } = layout;
  const parts: string[] = [];

  // 背景
  parts.push(
    `<rect x="0" y="0" width="${totalWidthPx}" height="${totalHeightPx}" fill="white"/>`,
  );

  // ラベル領域の右端に縦線
  parts.push(
    `<line x1="${CHART_LEFT}" y1="${TITLE_HEIGHT}" x2="${CHART_LEFT}" y2="${
      totalHeightPx - 8
    }" stroke="#d0d7de" stroke-width="1"/>`,
  );

  // タイトル
  parts.push(generateTitle(title));

  // 時間軸
  parts.push(generateAxis(layout));

  // セクションとステップ
  let currentY = CONTENT_TOP;
  for (const job of svgJobs) {
    parts.push(generateSectionLabel(job.section, currentY));
    currentY += SECTION_HEADER_HEIGHT;

    for (const step of job.steps) {
      parts.push(generateBar(step, currentY, layout));
      currentY += ROW_HEIGHT;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidthPx}" height="${totalHeightPx}" viewBox="0 0 ${totalWidthPx} ${totalHeightPx}">`,
    ...parts,
    `</svg>`,
  ].join("\n");
}
