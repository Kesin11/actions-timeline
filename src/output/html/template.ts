import type { HtmlReportData } from "./report.ts";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const serializeJsonForScript = (data: HtmlReportData): string =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const getRunHeaderBadge = (
  conclusion: string,
): { cardClass: string; badgeClass: string; label: string } => {
  switch (conclusion) {
    case "success":
      return {
        cardClass: "is-passed",
        badgeClass: "hb-pass",
        label: "✓ SUCCESS",
      };
    case "failure":
      return {
        cardClass: "is-failed",
        badgeClass: "hb-fail",
        label: "✕ FAILURE",
      };
    case "cancelled":
      return {
        cardClass: "",
        badgeClass: "hb-cancel",
        label: "■ CANCELLED",
      };
    case "skipped":
      return {
        cardClass: "",
        badgeClass: "hb-cancel",
        label: "⊘ SKIPPED",
      };
    default:
      return {
        cardClass: "",
        badgeClass: "hb-neutral",
        label: conclusion.toUpperCase(),
      };
  }
};

export const renderHtmlReport = (data: HtmlReportData): string => {
  const badge = getRunHeaderBadge(data.run.conclusion);
  const shortSha = data.run.head_sha.slice(0, 8);
  const hasComposite = data.jobs.some((job) =>
    job.items.some(
      (item) =>
        item.kind === "composite" ||
        (item.kind === "parallel" &&
          item.children.some((ch) => (ch.children?.length ?? 0) > 0)),
    ),
  );
  const hasParallel = data.jobs.some((job) =>
    job.items.some((item) => item.kind === "parallel"),
  );
  const titleText = `${data.repo} #${data.run.run_number} (${data.run.name}) — Actions Timeline`;
  const runHeading = data.run.html_url
    ? `<a class="run-title-link" href="${escapeHtml(data.run.html_url)}" target="_blank" rel="noopener noreferrer">Run #${data.run.run_number} (${data.run.id})</a>`
    : `Run #${data.run.run_number} (${data.run.id})`;
  const branchChip = data.run.head_branch
    ? `<code>${escapeHtml(data.run.head_branch)}</code>`
    : "";
  const compositeLegend = hasComposite
    ? '\n      <span class="lg"><span class="sw sw-comp"></span>Composite</span>'
    : "";
  const parallelLegend = hasParallel
    ? '\n      <span class="lg"><span class="sw sw-par"></span>Parallel</span>'
    : "";
  const waitCheckedAttr = data.showWaitingRunner ? " checked" : "";
  const serializedData = serializeJsonForScript(data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(titleText)}</title>
<style>
  :root {
    --bg-page: #f1f5f9;
    --bg-surface: #ffffff;
    --bg-header: #f8fafc;
    --bg-job: #f8fafc;
    --bg-fail-row: #fef2f2;
    --bg-active-row: #eff6ff;

    --border: #cbd5e1;
    --border-light: #e2e8f0;
    --grid-major: #e2e8f0;
    --grid-minor: #f1f5f9;

    --text-main: #0f172a;
    --text-sub: #334155;
    --text-muted: #64748b;
    --text-faint: #94a3b8;

    --bar-job: #1e3a5f;
    --bar-step: #3b82f6;
    --bar-composite: #0f766e;
    --bar-composite-bg: rgba(15, 118, 110, 0.10);
    --bar-composite-fg: #115e59;
    --bar-composite-child: #14b8a6;
    --bar-parallel: #5b21b6;
    --bar-parallel-bg: rgba(91, 33, 182, 0.09);
    --bar-parallel-fg: #4c1d95;
    --bar-parallel-child: #6366f1;
    --bar-wait-bg: #f1f5f9;
    --bar-wait-bd: #94a3b8;

    --st-pass: #15803d;
    --st-fail: #b91c1c;
    --st-fail-bg: #fee2e2;
    --st-fail-bar: #dc2626;
    --st-cancel: #64748b;
    --st-cancel-bar: #cbd5e1;
    --st-cancel-bd: #64748b;
    --st-skip: #94a3b8;

    --cp-fg: #92400e;
    --cp-bg: #fef3c7;
    --cp-bd: #d97706;

    --cursor-color: #0284c7;
    --left-w: 460px;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 16px 18px 24px;
    background: var(--bg-page);
    color: var(--text-main);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    line-height: 1.35;
  }

  .stack {
    max-width: 1280px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .page-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 0 2px;
    font-size: 11.5px;
    color: var(--text-muted);
    flex-wrap: wrap;
  }
  .page-meta strong { color: var(--text-main); }
  .page-meta code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    background: var(--bg-surface);
    border: 1px solid var(--border-light);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-sub);
  }

  .run-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .run-card.is-passed { border-top: 3px solid var(--st-pass); }
  .run-card.is-failed { border-top: 3px solid var(--st-fail-bar); }

  .run-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .run-head-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .run-head-left h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .run-title-link {
    color: inherit;
    text-decoration: none;
  }
  .run-title-link:hover {
    text-decoration: underline;
    color: #0369a1;
  }
  .run-meta-inline {
    color: var(--text-muted);
    font-size: 11.5px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .run-meta-inline code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    background: var(--bg-header);
    border: 1px solid var(--border-light);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-sub);
  }
  .run-stats {
    display: flex;
    gap: 14px;
    font-size: 11.5px;
    color: var(--text-muted);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    white-space: nowrap;
  }
  .run-stats b { color: var(--text-main); }

  .head-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .hb-pass { background: #dcfce7; color: var(--st-pass); border: 1px solid #86efac; }
  .hb-fail { background: var(--st-fail-bg); color: var(--st-fail); border: 1px solid #fca5a5; }
  .hb-cancel { background: #f1f5f9; color: var(--st-cancel); border: 1px solid var(--border); }
  .hb-neutral { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 16px;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border-light);
    font-size: 11px;
  }
  .tb-groups {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .tb-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .tb-sep {
    width: 1px;
    height: 16px;
    background: var(--border);
  }
  .btn {
    appearance: none;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-sub);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1.35;
  }
  .btn:hover { background: #f1f5f9; color: var(--text-main); }
  .btn.is-active {
    background: var(--bar-job);
    border-color: var(--bar-job);
    color: #ffffff;
  }
  .tb-check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-sub);
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }
  .tb-check input { margin: 0; cursor: pointer; accent-color: var(--bar-job); }
  .zoom-pill {
    display: none;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 4px;
    background: #e0f2fe;
    color: #0369a1;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 10.5px;
    font-weight: 600;
  }
  .zoom-pill.is-visible { display: inline-flex; }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding: 5px 16px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
  }
  .lg { display: inline-flex; align-items: center; gap: 5px; }
  .sw { width: 14px; height: 8px; border-radius: 2px; display: inline-block; }
  .sw-job { background: var(--bar-job); }
  .sw-step { background: var(--bar-step); }
  .sw-wait { background: var(--bar-wait-bg); border: 1px dashed var(--bar-wait-bd); }
  .sw-comp { background: var(--bar-composite-bg); border-top: 2px solid var(--bar-composite); border-left: 1.5px solid var(--bar-composite); border-right: 1.5px solid var(--bar-composite); height: 9px; border-radius: 2px 2px 0 0; }
  .sw-par { background: var(--bar-parallel-bg); border-top: 1.5px solid var(--bar-parallel); border-bottom: 1.5px solid var(--bar-parallel); border-left: 3px solid var(--bar-parallel); border-right: 1.5px dashed var(--bar-parallel); height: 9px; }
  .sw-cp { background: var(--bar-job); box-shadow: 0 0 0 1.5px var(--cp-bd); height: 8px; }

  .ledger-scroll {
    max-height: calc(100vh - 185px);
    min-height: 240px;
    overflow: auto;
    position: relative;
    background: var(--bg-surface);
  }
  .ledger {
    position: relative;
    min-width: 1160px;
    width: 100%;
  }

  .row {
    display: grid;
    grid-template-columns: var(--left-w) minmax(0, 1fr);
    border-bottom: 1px solid var(--border-light);
    height: 27px;
    background: var(--bg-surface);
  }
  .row-header {
    position: sticky;
    top: 0;
    z-index: 30;
    height: 30px;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    color: var(--text-muted);
    font-size: 11px;
  }
  .row-job {
    background: var(--bg-job);
    font-weight: 600;
  }
  .row-fail { background: var(--bg-fail-row); }
  .row-skip { color: var(--text-faint); }

  .row.is-cursor-active { background: var(--bg-active-row); }
  .row.is-cursor-active .left-cell { background: var(--bg-active-row); }
  .row.is-cursor-active .bar { filter: brightness(1.06); outline: 1.5px solid var(--cursor-color); outline-offset: 1px; }

  .left-cell {
    position: sticky;
    left: 0;
    z-index: 15;
    background: inherit;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 62px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-right: 1px solid var(--border);
    min-width: 0;
  }
  .row-header .left-cell {
    z-index: 40;
    background: var(--bg-header);
  }
  .row-job.is-toggleable .left-cell,
  .row-comp.is-toggleable .left-cell {
    cursor: pointer;
    user-select: none;
  }
  .row-job.is-toggleable:hover .left-cell,
  .row-comp.is-toggleable:hover .left-cell {
    background: #eef2f6;
  }
  .row-cp .left-cell { box-shadow: inset 3px 0 0 var(--cp-bd); }
  .row-cp .name-text { color: var(--text-main); font-weight: 600; }
  .row-cp .col-dur { color: var(--cp-fg); font-weight: 700; }
  .row-fail .left-cell { box-shadow: inset 3px 0 0 var(--st-fail-bar); }

  .col-name {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .chev-empty { width: 14px; flex-shrink: 0; }
  .name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .step-count {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-faint);
    flex-shrink: 0;
  }
  .gh-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    border-radius: 3px;
    color: var(--text-muted);
    opacity: 0.42;
    flex-shrink: 0;
    text-decoration: none;
  }
  .row:hover .gh-link, .gh-link:focus-visible { opacity: 1; color: #0369a1; }
  .gh-link:hover { background: #e0f2fe; }

  .col-dur {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 11px;
    color: var(--text-sub);
    text-align: right;
    white-space: nowrap;
  }
  .row-skip .col-dur { color: var(--text-faint); }

  .col-status {
    text-align: right;
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }
  .st-pass { color: var(--st-pass); }
  .st-fail {
    display: inline-block;
    padding: 0 5px;
    border-radius: 3px;
    background: var(--st-fail-bg);
    color: var(--st-fail);
  }
  .st-cancel { color: var(--st-cancel); }
  .st-skip { color: var(--st-skip); font-weight: 500; }
  .st-wait { color: var(--text-muted); font-weight: 500; }

  .cp-tag {
    display: inline-block;
    padding: 0 4px;
    border-radius: 2px;
    background: var(--cp-bg);
    color: var(--cp-fg);
    border: 1px solid var(--cp-bd);
    font-size: 9px;
    font-weight: 800;
    line-height: 1.4;
    flex-shrink: 0;
  }
  .kind {
    font-size: 9px;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 2px;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }
  .k-comp { background: #ccfbf1; color: #115e59; }
  .k-par { background: #e0e7ff; color: #3730a3; }

  .i1 { padding-left: 14px; }
  .i2 { padding-left: 32px; }
  .tree {
    font-family: ui-monospace, Consolas, monospace;
    color: #94a3b8;
    font-size: 11px;
    flex-shrink: 0;
  }

  .timeline-cell {
    position: relative;
    padding: 0 14px;
    display: flex;
    align-items: center;
    min-width: 0;
    cursor: crosshair;
    user-select: none;
  }
  .row-header .timeline-cell { cursor: default; }

  .track {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-image:
      linear-gradient(to right, var(--grid-major) 1px, transparent 1px),
      linear-gradient(to right, var(--grid-minor) 1px, transparent 1px);
    background-size: 16.666667% 100%, 8.333333% 100%;
  }
  .track::after {
    content: "";
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 1px;
    background: var(--grid-major);
  }

  .axis { position: relative; width: 100%; height: 100%; }
  .tick {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .tick.start { transform: translate(0, -50%); }
  .tick.end { transform: translate(-100%, -50%); }

  .bar {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 12px;
    border-radius: 3px;
    z-index: 2;
    min-width: 2px;
    cursor: pointer;
  }
  .b-job { height: 14px; background: var(--bar-job); }
  .b-step { height: 11px; background: var(--bar-step); }
  .b-wait { height: 10px; background: var(--bar-wait-bg); border: 1px dashed var(--bar-wait-bd); }
  .b-fail { height: 14px; background: var(--st-fail-bar); z-index: 4; }
  .b-cancel { height: 11px; background: var(--st-cancel-bar); border: 1px solid var(--st-cancel-bd); z-index: 3; }

  .row-cp .b-job,
  .row-cp .b-step,
  .row-cp .b-comp-child,
  .row-cp .b-par-child,
  .row-cp .b-fail {
    box-shadow: 0 0 0 2px var(--cp-bd), 0 1px 2px rgba(15, 23, 42, 0.14);
    z-index: 5;
  }
  .row-cp .b-wait {
    border-color: var(--cp-bd);
    box-shadow: 0 0 0 1.5px var(--cp-bd);
    z-index: 5;
  }

  .b-comp-bracket {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 16px;
    min-width: 6px;
    background: var(--bar-composite-bg);
    border-top: 2.5px solid var(--bar-composite);
    border-left: 1.5px solid var(--bar-composite);
    border-right: 1.5px solid var(--bar-composite);
    border-radius: 3px 3px 0 0;
    color: var(--bar-composite-fg);
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    padding: 0 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    z-index: 3;
    cursor: pointer;
  }
  .row-cp .b-comp-bracket { box-shadow: 0 -2px 0 0 var(--cp-bd); }
  .b-comp-child { height: 10px; background: var(--bar-composite-child); }

  .b-par-bracket {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 16px;
    min-width: 6px;
    background: var(--bar-parallel-bg);
    border-top: 1.5px solid var(--bar-parallel);
    border-bottom: 1.5px solid var(--bar-parallel);
    border-left: 3.5px solid var(--bar-parallel);
    border-right: 1.5px dashed var(--bar-parallel);
    color: var(--bar-parallel-fg);
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    padding: 0 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    z-index: 3;
    cursor: pointer;
  }
  .row-cp .b-par-bracket { box-shadow: 0 -2px 0 0 var(--cp-bd); }
  .b-par-child { height: 10px; background: var(--bar-parallel-child); border-radius: 0 3px 3px 0; }
  .bracket-side {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    z-index: 4;
    pointer-events: none;
  }
  .bracket-side-comp { color: var(--bar-composite-fg); pointer-events: auto; cursor: pointer; }
  .bracket-side-par { color: var(--bar-parallel-fg); }

  .fork-line {
    position: absolute;
    top: 0; bottom: 0;
    width: 1.5px;
    background: var(--bar-parallel);
    z-index: 3;
    pointer-events: none;
  }
  .join-line {
    position: absolute;
    top: 0; bottom: 0;
    border-left: 1.5px dashed var(--bar-parallel);
    z-index: 3;
    pointer-events: none;
  }

  .timeline-overlay {
    position: absolute;
    top: 30px;
    bottom: 0;
    left: calc(var(--left-w) + 14px);
    right: 14px;
    pointer-events: none;
    z-index: 12;
  }
  .cursor-line {
    display: none;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--cursor-color);
  }
  .cursor-badge {
    display: none;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--cursor-color);
    color: #ffffff;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    z-index: 35;
    pointer-events: none;
  }
  .zoom-select {
    display: none;
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(2, 132, 199, 0.14);
    border-left: 1.5px solid var(--cursor-color);
    border-right: 1.5px solid var(--cursor-color);
  }

  .tooltip {
    display: none;
    position: fixed;
    z-index: 100;
    pointer-events: none;
    background: rgba(15, 23, 42, 0.94);
    color: #f8fafc;
    padding: 6px 9px;
    border-radius: 5px;
    font-size: 11px;
    line-height: 1.4;
    max-width: 360px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
  }
  .tooltip.is-visible { display: block; }
  .tt-name { font-weight: 700; word-break: break-word; margin-bottom: 1px; }
  .tt-dur { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; color: #cbd5e1; font-size: 10.5px; }

  .empty-state {
    padding: 28px 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
</head>
<body>
<div class="stack">
  <div class="page-meta">
    <div><strong>${escapeHtml(data.repo)}</strong> · Workflow: <strong>${escapeHtml(data.run.name)}</strong> (${escapeHtml(data.run.path)}) · Commit <code>${escapeHtml(shortSha)}</code></div>
  </div>

  <section class="run-card ${badge.cardClass}">
    <div class="run-header">
      <div class="run-head-left">
        <h1>${runHeading}</h1>
        <span class="head-badge ${badge.badgeClass}">${escapeHtml(badge.label)}</span>
        <div class="run-meta-inline">
          ${branchChip}
          <span id="jobSummary"></span>
        </div>
      </div>
      <div class="run-stats">
        <span>Wall: <b id="wallStat"></b></span>
        <span>Scale: <b id="scaleStat"></b></span>
      </div>
    </div>

    <div class="toolbar">
      <div class="tb-groups">
        <div class="tb-group" role="group" aria-label="Expand jobs">
          <button type="button" class="btn is-active" data-expand="cp">Expand CP</button>
          <button type="button" class="btn" data-expand="all">Expand all</button>
          <button type="button" class="btn" data-expand="none">Collapse all</button>
        </div>
        <span class="tb-sep"></span>
        <div class="tb-group" role="group" aria-label="Filter jobs">
          <button type="button" class="btn is-active" data-filter="all">All</button>
          <button type="button" class="btn" data-filter="cp">CP only</button>
          <button type="button" class="btn" data-filter="failed">Failed only</button>
        </div>
        <span class="tb-sep"></span>
        <label class="tb-check">
          <input type="checkbox" id="toggleWait"${waitCheckedAttr}>
          <span>Runner wait</span>
        </label>
      </div>
      <span class="zoom-pill" id="zoomPill"></span>
    </div>

    <div class="legend">
      <span class="lg"><span class="sw sw-job"></span>Job</span>
      <span class="lg"><span class="sw sw-wait"></span>Wait</span>
      <span class="lg"><span class="sw sw-step"></span>Step</span>${compositeLegend}${parallelLegend}
      <span class="lg"><span class="sw sw-cp"></span><span class="cp-tag">CP</span>Critical Path</span>
    </div>

    <div class="ledger-scroll" id="ledgerScroll">
      <div class="ledger" id="ledger">
        <div class="row row-header">
          <div class="left-cell">
            <span>Job / Step</span>
            <span style="text-align:right">Duration</span>
            <span style="text-align:right">Status</span>
          </div>
          <div class="timeline-cell" id="headerTimeline">
            <div class="axis" id="axis"></div>
            <div class="cursor-badge" id="cursorBadge"></div>
          </div>
        </div>
        <div id="rowsRoot"></div>
        <div class="timeline-overlay" id="timelineOverlay">
          <div class="cursor-line" id="cursorLine"></div>
          <div class="zoom-select" id="zoomSelect"></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="tooltip" id="tooltip">
  <div class="tt-name" id="ttName"></div>
  <div class="tt-dur" id="ttDur"></div>
</div>

<script>
(function () {
  const DATA = ${serializedData};

  const LINK_SVG = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3"/><path d="M9.5 2.5h4v4"/><path d="M13.5 2.5L7 9"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDur(sec) {
    if (sec == null || Number.isNaN(sec) || sec < 0) return '—';
    const s = Math.round(sec);
    if (s >= 60) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + 'm' + String(r).padStart(2, '0') + 's';
    }
    return s + 's';
  }

  function fmtAxis(sec) {
    const s = Math.round(sec);
    if (s === 0) return '0s';
    if (s % 60 === 0) return (s / 60) + 'm';
    if (s > 60) return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
    return s + 's';
  }

  function statusMeta(conclusion) {
    switch (conclusion) {
      case 'success': return { cls: 'st-pass', text: '✓ PASS', stepText: '✓ OK', rowCls: '' };
      case 'failure': return { cls: 'st-fail', text: '✕ FAIL', stepText: '✕ FAIL', rowCls: ' row-fail' };
      case 'cancelled': return { cls: 'st-cancel', text: '■ CANCEL', stepText: '■ CANCEL', rowCls: '' };
      case 'skipped': return { cls: 'st-skip', text: '⊘ SKIP', stepText: '⊘ SKIP', rowCls: ' row-skip' };
      default: return { cls: 'st-wait', text: esc(conclusion || '—'), stepText: esc(conclusion || '—'), rowCls: '' };
    }
  }

  const state = {
    expandedJobs: new Set(DATA.jobs.filter(j => j.isCp || j.conclusion === 'failure').map(j => j.id)),
    expandedComposites: new Set(),
    filter: 'all',
    showWait: DATA.showWaitingRunner !== false,
    viewStart: 0,
    viewEnd: DATA.scaleSec,
  };

  const ledger = document.getElementById('ledger');
  const rowsRoot = document.getElementById('rowsRoot');
  const axisEl = document.getElementById('axis');
  const cursorLine = document.getElementById('cursorLine');
  const cursorBadge = document.getElementById('cursorBadge');
  const zoomSelect = document.getElementById('zoomSelect');
  const zoomPill = document.getElementById('zoomPill');
  const timelineOverlay = document.getElementById('timelineOverlay');
  const tooltip = document.getElementById('tooltip');
  const ttName = document.getElementById('ttName');
  const ttDur = document.getElementById('ttDur');

  const counts = {};
  DATA.jobs.forEach(j => { counts[j.conclusion] = (counts[j.conclusion] || 0) + 1; });
  document.getElementById('jobSummary').textContent =
    DATA.jobs.length + ' jobs (' + Object.entries(counts).map(([k, v]) => v + ' ' + k).join(' · ') + ')';
  document.getElementById('wallStat').textContent = fmtDur(DATA.wallSec);

  function spanGeom(start, end) {
    const span = state.viewEnd - state.viewStart;
    if (span <= 0 || start == null || end == null) return null;
    if (end < state.viewStart || start > state.viewEnd) return null;
    const leftPct = ((start - state.viewStart) / span) * 100;
    const rawW = ((end - start) / span) * 100;
    return {
      left: leftPct.toFixed(3) + '%',
      width: Math.max(0.25, rawW).toFixed(3) + '%',
      endPct: (((Math.max(end, start + span * 0.008)) - state.viewStart) / span * 100).toFixed(3) + '%',
      frac: (end - start) / span,
    };
  }

  function linkHtml(url) {
    if (!url) return '';
    return '<a class="gh-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="Open GitHub log">' + LINK_SVG + '</a>';
  }

  function spanAttrs(name, dur) {
    return ' data-tt-name="' + esc(name) + '" data-tt-dur="' + dur + '"';
  }

  function renderAxis() {
    const span = state.viewEnd - state.viewStart;
    axisEl.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const val = state.viewStart + (span / 6) * i;
      const pos = (i / 6 * 100).toFixed(4) + '%';
      const cls = i === 0 ? 'tick start' : i === 6 ? 'tick end' : 'tick';
      return '<span class="' + cls + '" style="left:' + pos + ';">' + fmtAxis(val) + '</span>';
    }).join('');
    const isZoomed = state.viewStart > 0.01 || state.viewEnd < DATA.scaleSec - 0.01;
    document.getElementById('scaleStat').textContent = fmtAxis(state.viewStart) + '–' + fmtAxis(state.viewEnd);
    if (isZoomed) {
      zoomPill.textContent = 'Zoom: ' + fmtDur(state.viewStart) + '–' + fmtDur(state.viewEnd) + ' (double-click to reset)';
      zoomPill.classList.add('is-visible');
    } else {
      zoomPill.classList.remove('is-visible');
    }
  }

  function visibleJobs() {
    return DATA.jobs.filter(j => {
      if (state.filter === 'cp') return j.isCp;
      if (state.filter === 'failed') return j.conclusion === 'failure';
      return true;
    });
  }

  function renderRows() {
    const jobs = visibleJobs();
    if (jobs.length === 0) {
      rowsRoot.innerHTML = '<div class="empty-state">No jobs match the current filter</div>';
      return;
    }

    const parts = [];
    jobs.forEach(job => {
      const isSkip = job.conclusion === 'skipped';
      const st = statusMeta(job.conclusion);
      const canToggle = !isSkip && (job.items.length > 0 || (state.showWait && job.waitDur >= 1));
      const isExpanded = canToggle && state.expandedJobs.has(job.id);
      const chev = canToggle ? '<span class="chev">' + (isExpanded ? '▾' : '▸') + '</span>' : '<span class="chev-empty"></span>';
      const cpTag = job.isCp ? '<span class="cp-tag">CP</span>' : '';
      const stepBadge = (!isExpanded && job.rawStepCount > 0) ? '<span class="step-count">(' + job.rawStepCount + ' steps)</span>' : '';
      const jobDur = state.showWait ? job.totalDur : job.execDur;

      let jobBars = '';
      if (!isSkip) {
        if (state.showWait && job.waitDur >= 1) {
          const wg = spanGeom(job.waitStart, job.waitEnd);
          if (wg) {
            jobBars += '<div class="bar b-wait" style="left:' + wg.left + ';width:' + wg.width + ';"' +
              spanAttrs(job.name + ' — runner waiting', job.waitDur) + '></div>';
          }
        }
        const jg = spanGeom(job.start, job.end);
        if (jg) {
          const bCls = job.conclusion === 'failure' ? 'b-fail' : job.conclusion === 'cancelled' ? 'b-cancel' : 'b-job';
          jobBars += '<div class="bar ' + bCls + '" style="left:' + jg.left + ';width:' + jg.width + ';"' +
            spanAttrs(job.name, job.execDur) + '></div>';
        }
      }

      parts.push(
        '<div class="row row-job' + st.rowCls + (job.isCp ? ' row-cp' : '') + (canToggle ? ' is-toggleable' : '') + '"' +
        ' data-row-kind="job" data-job-id="' + job.id + '">' +
        '<div class="left-cell">' +
          '<div class="col-name">' + chev + cpTag + '<span class="name-text" title="' + esc(job.name) + '">' + esc(job.name) + '</span>' + stepBadge + linkHtml(job.html_url) + '</div>' +
          '<div class="col-dur">' + (isSkip ? '—' : fmtDur(jobDur)) + '</div>' +
          '<div class="col-status"><span class="' + st.cls + '">' + st.text + '</span></div>' +
        '</div>' +
        '<div class="timeline-cell"><div class="track">' + jobBars + '</div></div>' +
        '</div>'
      );

      if (!isExpanded) return;

      const entries = [];
      if (state.showWait && job.waitDur >= 1) {
        entries.push({ kind: 'wait', start: job.waitStart, end: job.waitEnd, dur: job.waitDur });
      }
      job.items.forEach(it => entries.push(it));

      entries.forEach((entry, idx) => {
        const branch = idx === entries.length - 1 ? '└─' : '├─';
        if (entry.kind === 'wait') {
          const wg = spanGeom(entry.start, entry.end);
          const bar = wg ? '<div class="bar b-wait" style="left:' + wg.left + ';width:' + wg.width + ';"' +
            spanAttrs('runner waiting', entry.dur) + '></div>' : '';
          parts.push(
            '<div class="row' + (job.isCp ? ' row-cp' : '') + '" data-row-kind="step" data-job-id="' + job.id + '" data-start="' + entry.start + '" data-end="' + entry.end + '">' +
            '<div class="left-cell">' +
              '<div class="col-name i1"><span class="tree">' + branch + '</span>' + cpTag + '<span class="name-text">runner waiting</span></div>' +
              '<div class="col-dur">' + fmtDur(entry.dur) + '</div>' +
              '<div class="col-status st-wait">◷ WAIT</div>' +
            '</div>' +
            '<div class="timeline-cell"><div class="track">' + bar + '</div></div>' +
            '</div>'
          );
          return;
        }

        const sst = statusMeta(entry.conclusion);
        const sSkip = entry.conclusion === 'skipped';
        const stepUrl = (job.html_url && entry.number != null) ? (job.html_url + '#step:' + entry.number + ':1') : '';

        if (entry.kind === 'composite') {
          const compKey = job.id + ':' + idx;
          const compOpen = state.expandedComposites.has(compKey);
          const cChev = '<span class="chev">' + (compOpen ? '▾' : '▸') + '</span>';
          const label = entry.name + ' (' + fmtDur(entry.dur) + ')';
          let bracket = '';
          if (!sSkip) {
            const g = spanGeom(entry.start, entry.end);
            if (g) {
              const fits = g.frac >= 0.14;
              bracket = '<div class="b-comp-bracket" style="left:' + g.left + ';width:' + g.width + ';"' +
                spanAttrs(entry.name, entry.dur) + '>' + (fits ? esc(label) : '') + '</div>' +
                (fits ? '' : '<span class="bracket-side bracket-side-comp" style="left:calc(' + g.endPct + ' + 6px);">' + esc(label) + '</span>');
            }
          }
          parts.push(
            '<div class="row row-comp is-toggleable' + sst.rowCls + (entry.isCp ? ' row-cp' : '') + '"' +
            ' data-row-kind="step" data-comp-key="' + esc(compKey) + '" data-job-id="' + job.id + '"' +
            (entry.start != null ? ' data-start="' + entry.start + '" data-end="' + entry.end + '"' : '') + '>' +
            '<div class="left-cell">' +
              '<div class="col-name i1"><span class="tree">' + branch + '</span>' + cChev + (entry.isCp ? '<span class="cp-tag">CP</span>' : '') + '<span class="kind k-comp">Composite</span><span class="name-text" title="' + esc(entry.name) + '">' + esc(entry.name) + '</span>' + (!compOpen ? '<span class="step-count">(' + entry.children.length + ')</span>' : '') + linkHtml(stepUrl) + '</div>' +
              '<div class="col-dur">' + (sSkip ? '—' : fmtDur(entry.dur)) + '</div>' +
              '<div class="col-status"><span class="' + sst.cls + '">' + sst.stepText + '</span></div>' +
            '</div>' +
            '<div class="timeline-cell"><div class="track">' + bracket + '</div></div>' +
            '</div>'
          );
          if (compOpen) {
            entry.children.forEach((ch, cIdx) => {
            const cBranch = cIdx === entry.children.length - 1 ? '??' : '??';
            const cst = statusMeta(ch.conclusion);
            const cSkip = ch.conclusion === 'skipped';
            const cg = !cSkip ? spanGeom(ch.start, ch.end) : null;
            const nestedSubs = Array.isArray(ch.children) ? ch.children : [];
            const hasNestedComp = nestedSubs.length > 0;
            const nestedCompKey = hasNestedComp ? (job.id + ':' + sIdx + ':' + cIdx) : '';
            const nestedOpen = hasNestedComp && state.expandedComposites.has(nestedCompKey);
            let cBar = '';
            if (cg) {
              if (pg) {
                cBar += '<div class="fork-line" style="left:' + pg.left + ';"></div><div class="join-line" style="left:' + pg.endPct + ';"></div>';
              }
              if (hasNestedComp) {
                const subLabel = ch.name + ' (' + fmtDur(ch.dur) + ')';
                const fits = cg.frac >= 0.15;
                cBar += '<div class="b-comp-bracket" style="left:' + cg.left + ';width:' + cg.width + ';"' +
                  spanAttrs(ch.name, ch.dur) + '>' + (fits ? esc(subLabel) : '') + '</div>' +
                  (fits ? '' : '<span class="bracket-side bracket-side-comp" style="left:calc(' + cg.endPct + ' + 6px);">' + esc(subLabel) + '</span>');
              } else {
                cBar += '<div class="bar b-par-child" style="left:' + cg.left + ';width:' + cg.width + ';"' +
                  spanAttrs(ch.name, ch.dur) + '></div>';
              }
            }
            const chUrl = (job.html_url && ch.number != null) ? (job.html_url + '#step:' + ch.number + ':1') : '';
            parts.push(
              '<div class="row' + (hasNestedComp ? ' row-comp is-toggleable' : '') + cst.rowCls + (ch.isCp ? ' row-cp' : '') + '" data-row-kind="' + (hasNestedComp ? 'comp' : 'step') + '" data-job-id="' + job.id + '"' +
              (hasNestedComp ? ' data-comp-key="' + esc(nestedCompKey) + '"' : '') +
              (ch.start != null ? ' data-start="' + ch.start + '" data-end="' + ch.end + '"' : '') + '>' +
              '<div class="left-cell">' +
                '<div class="col-name i2"><span class="tree">' + cBranch + '</span>' +
                  (hasNestedComp ? '<span class="chev">' + (nestedOpen ? '?' : '?') + '</span>' : '') +
                  (ch.isCp ? '<span class="cp-tag">CP</span>' : '') +
                  (hasNestedComp ? '<span class="kind k-comp">Composite</span>' : '') +
                  '<span class="name-text" title="' + esc(ch.name) + '">' + esc(ch.name) + '</span>' +
                  (hasNestedComp ? '<span class="step-count">(' + nestedSubs.length + ')</span>' : '') +
                  linkHtml(chUrl) +
                '</div>' +
                '<div class="col-dur">' + (cSkip ? '?' : fmtDur(ch.dur)) + '</div>' +
                '<div class="col-status"><span class="' + cst.cls + '">' + cst.stepText + '</span></div>' +
              '</div>' +
              '<div class="timeline-cell"><div class="track">' + cBar + '</div></div>' +
              '</div>'
            );
            if (nestedOpen) {
              nestedSubs.forEach((sub, subIdx) => {
                const subBranch = subIdx === nestedSubs.length - 1 ? '??' : '??';
                const subSt = statusMeta(sub.conclusion);
                const subSkip = sub.conclusion === 'skipped';
                const subG = !subSkip ? spanGeom(sub.start, sub.end) : null;
                let subBar = '';
                if (subG) {
                  if (pg) {
                    subBar += '<div class="fork-line" style="left:' + pg.left + ';"></div><div class="join-line" style="left:' + pg.endPct + ';"></div>';
                  }
                  subBar += '<div class="bar b-comp-child" style="left:' + subG.left + ';width:' + subG.width + ';"' +
                    spanAttrs(sub.name, sub.dur) + '></div>';
                }
                const subUrl = (job.html_url && sub.number != null) ? (job.html_url + '#step:' + sub.number + ':1') : '';
                parts.push(
                  '<div class="row' + subSt.rowCls + (sub.isCp ? ' row-cp' : '') + '" data-row-kind="comp-child" data-job-id="' + job.id + '"' +
                  (sub.start != null ? ' data-start="' + sub.start + '" data-end="' + sub.end + '"' : '') + '>' +
                  '<div class="left-cell">' +
                    '<div class="col-name i3"><span class="tree">' + subBranch + '</span><span class="name-text" title="' + esc(sub.name) + '">' + esc(sub.name) + '</span>' + linkHtml(subUrl) + '</div>' +
                    '<div class="col-dur">' + (subSkip ? '?' : fmtDur(sub.dur)) + '</div>' +
                    '<div class="col-status"><span class="' + subSt.cls + '">' + subSt.stepText + '</span></div>' +
                  '</div>' +
                  '<div class="timeline-cell"><div class="track">' + subBar + '</div></div>' +
                  '</div>'
                );
              });
            }
          });
          return;
        }

        const sg = !sSkip ? spanGeom(entry.start, entry.end) : null;
        const bCls = entry.conclusion === 'failure' ? 'b-fail' : entry.conclusion === 'cancelled' ? 'b-cancel' : 'b-step';
        const sBar = sg ? '<div class="bar ' + bCls + '" style="left:' + sg.left + ';width:' + sg.width + ';"' +
          spanAttrs(entry.name, entry.dur) + '></div>' : '';
        parts.push(
          '<div class="row' + sst.rowCls + (entry.isCp ? ' row-cp' : '') + '" data-row-kind="step" data-job-id="' + job.id + '"' +
          (entry.start != null ? ' data-start="' + entry.start + '" data-end="' + entry.end + '"' : '') + '>' +
          '<div class="left-cell">' +
            '<div class="col-name i1"><span class="tree">' + branch + '</span>' + (entry.isCp ? '<span class="cp-tag">CP</span>' : '') + '<span class="name-text" title="' + esc(entry.name) + '">' + esc(entry.name) + '</span>' + linkHtml(stepUrl) + '</div>' +
            '<div class="col-dur">' + (sSkip ? '—' : fmtDur(entry.dur)) + '</div>' +
            '<div class="col-status"><span class="' + sst.cls + '">' + sst.stepText + '</span></div>' +
          '</div>' +
          '<div class="timeline-cell"><div class="track">' + sBar + '</div></div>' +
          '</div>'
        );
      });
    });

    rowsRoot.innerHTML = parts.join('');
  }

  function render() {
    renderAxis();
    renderRows();
  }

  document.querySelectorAll('[data-expand]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-expand');
      document.querySelectorAll('[data-expand]').forEach(b => b.classList.toggle('is-active', b === btn));
      state.expandedJobs.clear();
      if (mode === 'cp') {
        DATA.jobs.forEach(j => { if (j.isCp || j.conclusion === 'failure') state.expandedJobs.add(j.id); });
      } else if (mode === 'all') {
        DATA.jobs.forEach(j => { if (j.conclusion !== 'skipped') state.expandedJobs.add(j.id); });
      }
      renderRows();
    });
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter = btn.getAttribute('data-filter');
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('is-active', b === btn));
      renderRows();
    });
  });

  document.getElementById('toggleWait').addEventListener('change', (e) => {
    state.showWait = e.target.checked;
    renderRows();
  });

  rowsRoot.addEventListener('click', (e) => {
    if (e.target.closest('.gh-link')) return;
    if (justDragged) { justDragged = false; return; }
    const leftCell = e.target.closest('.left-cell');
    if (leftCell) {
      const row = leftCell.closest('.row');
      if (!row || !row.classList.contains('is-toggleable')) return;
      if (row.classList.contains('row-job')) {
        const id = Number(row.getAttribute('data-job-id'));
        if (state.expandedJobs.has(id)) state.expandedJobs.delete(id);
        else state.expandedJobs.add(id);
        document.querySelectorAll('[data-expand]').forEach(b => b.classList.remove('is-active'));
        renderRows();
      } else if (row.classList.contains('row-comp')) {
        const key = row.getAttribute('data-comp-key');
        if (state.expandedComposites.has(key)) state.expandedComposites.delete(key);
        else state.expandedComposites.add(key);
        renderRows();
      }
      return;
    }
    const compSpan = e.target.closest('.b-comp-bracket, .bracket-side-comp');
    if (compSpan) {
      const row = compSpan.closest('.row-comp.is-toggleable');
      if (!row) return;
      const key = row.getAttribute('data-comp-key');
      if (state.expandedComposites.has(key)) state.expandedComposites.delete(key);
      else state.expandedComposites.add(key);
      renderRows();
    }
  });

  rowsRoot.addEventListener('mouseleave', () => {
    hideCursor();
    hideTooltip();
  });

  function hideTooltip() { tooltip.classList.remove('is-visible'); }
  rowsRoot.addEventListener('mousemove', (e) => {
    const spanEl = e.target.closest('[data-tt-name]');
    if (!spanEl) { hideTooltip(); return; }
    ttName.textContent = spanEl.getAttribute('data-tt-name');
    ttDur.textContent = fmtDur(Number(spanEl.getAttribute('data-tt-dur')));
    tooltip.classList.add('is-visible');
    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
    tooltip.style.left = Math.max(8, x) + 'px';
    tooltip.style.top = Math.max(8, y) + 'px';
  });

  let dragStartFrac = null;
  let dragStartX = null;
  let justDragged = false;

  function hideCursor() {
    cursorLine.style.display = 'none';
    cursorBadge.style.display = 'none';
    rowsRoot.querySelectorAll('.is-cursor-active').forEach(el => el.classList.remove('is-cursor-active'));
  }

  function updateCursor(clientX) {
    const rect = timelineOverlay.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = state.viewStart + frac * (state.viewEnd - state.viewStart);
    cursorLine.style.display = 'block';
    cursorLine.style.left = (frac * 100).toFixed(3) + '%';
    cursorBadge.style.display = 'block';
    cursorBadge.style.left = 'calc(14px + ' + (frac * rect.width).toFixed(1) + 'px)';
    cursorBadge.textContent = fmtDur(t);

    rowsRoot.querySelectorAll('.row[data-start]').forEach(r => {
      const rs = Number(r.getAttribute('data-start'));
      const re = Number(r.getAttribute('data-end'));
      r.classList.toggle('is-cursor-active', t >= rs && t <= Math.max(re, rs + 0.5));
    });
    return frac;
  }

  rowsRoot.addEventListener('mousemove', (e) => {
    if (!e.target.closest('.timeline-cell') && dragStartFrac == null) {
      hideCursor();
      return;
    }
    const frac = updateCursor(e.clientX);
    if (dragStartFrac != null && frac != null) {
      const a = Math.min(dragStartFrac, frac);
      const b = Math.max(dragStartFrac, frac);
      zoomSelect.style.display = 'block';
      zoomSelect.style.left = (a * 100).toFixed(3) + '%';
      zoomSelect.style.width = ((b - a) * 100).toFixed(3) + '%';
    }
  });

  rowsRoot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest('.timeline-cell')) return;
    const rect = timelineOverlay.getBoundingClientRect();
    if (rect.width <= 0) return;
    dragStartX = e.clientX;
    dragStartFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    zoomSelect.style.display = 'none';
  });

  window.addEventListener('mouseup', (e) => {
    if (dragStartFrac == null) return;
    const rect = timelineOverlay.getBoundingClientRect();
    const endFrac = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : dragStartFrac;
    const pxDelta = Math.abs(e.clientX - dragStartX);
    const a = Math.min(dragStartFrac, endFrac);
    const b = Math.max(dragStartFrac, endFrac);
    dragStartFrac = null;
    dragStartX = null;
    zoomSelect.style.display = 'none';

    if (pxDelta >= 8 && b > a) {
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      const span = state.viewEnd - state.viewStart;
      const newStart = state.viewStart + a * span;
      const newEnd = state.viewStart + b * span;
      if (newEnd - newStart >= 1) {
        state.viewStart = newStart;
        state.viewEnd = newEnd;
        render();
      }
    }
  });

  ledger.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.timeline-cell')) return;
    if (state.viewStart !== 0 || state.viewEnd !== DATA.scaleSec) {
      state.viewStart = 0;
      state.viewEnd = DATA.scaleSec;
      render();
    }
  });

  render();
})();
</script>
</body>
</html>
`;
};
