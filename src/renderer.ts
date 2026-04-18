import { createGanttDiagrams } from "./workflow_gantt.ts";
import { calcLayout, generateSvg, toSvgGanttJobs } from "./svg_gantt.ts";
import type { ganttJob } from "./types.ts";

export type OutputFormat = "mermaid" | "svg";

export interface GanttRenderer {
  render(title: string, ganttJobs: ganttJob[]): string;
}

/**
 * Mermaidガントチャートテキストを生成するレンダラー。
 * 既存の createGanttDiagrams() をラップし、複数チャートへの分割を内部で処理する。
 */
export class MermaidGanttRenderer implements GanttRenderer {
  render(title: string, ganttJobs: ganttJob[]): string {
    return createGanttDiagrams(title, ganttJobs).join("\n");
  }
}

/**
 * SVGガントチャートを直接生成するレンダラー。
 * 外部サービスやブラウザに依存せず、インラインSVG文字列を返す。
 */
export class SvgGanttRenderer implements GanttRenderer {
  render(title: string, ganttJobs: ganttJob[]): string {
    const svgJobs = toSvgGanttJobs(ganttJobs);
    const layout = calcLayout(svgJobs);
    return generateSvg(title, svgJobs, layout);
  }
}

/**
 * OutputFormatに対応するGanttRendererインスタンスを返すファクトリ関数。
 */
export function createRenderer(format: OutputFormat): GanttRenderer {
  switch (format) {
    case "svg":
      return new SvgGanttRenderer();
    default:
      return new MermaidGanttRenderer();
  }
}
