# actions-timeline

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Kesin11/actions-timeline)

An Action that visualizes the timeline of a GitHub Actions workflow run as an **interactive HTML report** and a **Mermaid Gantt diagram** in the run summary page.

`actions-timeline` helps you inspect the sequence and concurrency of jobs and steps in a workflow run so you can quickly spot bottlenecks, critical paths, runner wait times, and failures.

![Sample screenshot workflow](https://github.com/user-attachments/assets/03353645-ec6f-4fd6-80b5-69694439393f)
![Sample screenshot timeline](https://github.com/user-attachments/assets/d92027fc-ded2-4b6e-9ab0-e3923b698ec3)

## Outputs

By default, `actions-timeline` produces two complementary views for each workflow run:

1. **Interactive HTML Timeline** (default: enabled via `output-html: true`)
   - Uploaded as a self-contained, unzipped `.html` workflow artifact with a link placed at the top of the Job Summary.
   - Highlights the deterministic critical path across job `needs`.
   - Supports expanding/collapsing jobs and composite actions, filtering (`All` / `CP only` / `Failed only`), toggling runner wait bars, drag-to-zoom with double-click reset, hover tooltips, a vertical time cursor, and direct links to GitHub job/step logs.
2. **Mermaid Gantt Diagram**
   - Rendered inline in the GitHub Actions Job Summary using GitHub Flavored Markdown Mermaid support for quick at-a-glance inspection without leaving the summary page.

## USAGE

```yaml
jobs:
  build:
    runs-on: ubuntu-slim
    steps:
      # Register this action before your build steps. It runs automatically
      # during the job post-processing phase.
      - uses: Kesin11/actions-timeline@v2
        with:
          # e.g.: ${{ secrets.MY_PAT }}
          # Default: ${{ github.token }}
          github-token: ""
          # Show waiting runner time in both the HTML and Mermaid timelines.
          # Default: true
          show-waiting-runner: true
          # Generate a self-contained interactive HTML timeline report, upload
          # it as an unzipped artifact, and link it at the top of the Job Summary.
          # Default: true
          output-html: true
          # Expand repo-local composite action steps in both timelines while
          # keeping the parent composite step and showing its sub-steps.
          # Note: This option requires additional API calls to fetch job logs
          # and workflow files, which may increase execution time.
          # Limitation: Composite actions that contain nested local composite
          # actions (uses: ./.github/actions/...) are not expanded.
          # Default: true
          expand-composite-actions: true
          # Duration threshold in seconds for expanding composite action steps.
          # Only steps at or above this duration are expanded.
          # Default: 20
          expand-composite-actions-threshold: 20

      # Your build steps...
```

If your workflow has many jobs, register `actions-timeline` in the longest-running job or in a dedicated final job that depends on the other jobs:

```yaml
jobs:
  build-1:
  build-2:
  build-3:

  actions-timeline:
    needs: [build-1, build-2, build-3]
    runs-on: ubuntu-slim
    steps:
      - uses: Kesin11/actions-timeline@v2
```

## How it works

`actions-timeline` fetches workflow run metadata, jobs, and steps from the GitHub API during the job's post-processing step, then builds both outputs:

- **Interactive HTML report**: Embeds the timeline data into a single standalone `.html` file, uploads it as an unzipped artifact.
- **Mermaid Gantt diagram**: Formats the timeline as [Mermaid Gantt](https://mermaid.js.org/syntax/gantt.html) syntax and writes it directly to the Job Summary below the HTML link.

Steps declared with the GitHub Actions `parallel` syntax are detected automatically and verified against the job log. Both outputs preserve the `Parallel group` parent alongside its concurrent child steps at their shared start time.

Repo-local composite actions are expanded in both outputs by default (`expand-composite-actions: true`, with `expand-composite-actions-threshold: 20` seconds). The parent composite step remains visible with its internal sub-steps beneath it (collapsible in the HTML report). Set `expand-composite-actions: false` to disable expansion. Nested repo-local composite actions are not currently expanded.

Register this action before your main steps so its post-processing hook captures the full job execution.

## Support GHES

`actions-timeline` also works on GitHub Enterprise Server (GHES). It reads the `GITHUB_API_URL` environment variable automatically from GitHub Actions' [default environment variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables), so no extra configuration is needed.


## Known issues

> [!IMPORTANT]
> **In some cases, the workflow requires `actions: read` permission.**

Depending on your repository settings, `actions: read` permission may be required to fetch workflow jobs and steps:

```yaml
jobs:
  build:
    permissions:
      actions: read
    runs-on: ubuntu-slim
    steps:
      - uses: Kesin11/actions-timeline@v2
```

> [!IMPORTANT]
> **'Waiting for a runner' step is not supported on GHES < v3.9**

The `workflow_job` API response does not include `created_at` in [GHES v3.8](https://docs.github.com/en/enterprise-server@3.8/rest/actions/workflow-jobs#get-a-job-for-a-workflow-run); it was added in [GHES v3.9](https://docs.github.com/en/enterprise-server@3.9/rest/actions/workflow-jobs?apiVersion=2022-11-28). When `created_at` is absent, `actions-timeline` omits runner wait time.

# Similar works

- https://github.com/Kesin11/github_actions_otel_trace
- https://github.com/inception-health/otel-export-trace-action
- https://github.com/runforesight/workflow-telemetry-action

# CLI tool

`actions-timeline` is also available as a development CLI that can generate either a self-contained **HTML report** (`--format html`) or a **Mermaid Markdown diagram** (`--format mermaid`, default). Clone this repository, install dependencies with npm, and run it with Node.js 24 (the CLI is not published to npm).

```bash
git clone https://github.com/Kesin11/actions-timeline.git
cd actions-timeline
npm install

# Generate a self-contained interactive HTML timeline report (default format)
node cli.ts \
  https://github.com/Kesin11/actions-timeline/actions/runs/8021493760/attempts/1 \
  -t $(gh auth token) \
  -o timeline.html

# Generate a Mermaid Markdown timeline
node cli.ts \
  https://github.com/Kesin11/actions-timeline/actions/runs/8021493760/attempts/1 \
  -t $(gh auth token) \
  --format mermaid \
  -o output.md

# Fetch the latest attempt when the URL omits /attempts/<number>
node cli.ts \
  https://github.com/Kesin11/actions-timeline/actions/runs/8021493760/ \
  -t $(gh auth token) \
  --format html \
  -o timeline.html

# GHES
node cli.ts \
  https://YOUR_ENTERPRISE_HOST/OWNER/REPO/actions/runs/RUN_ID/attempts/1 \
  -t $(gh auth token -h YOUR_ENTERPRISE_HOST) \
  --format html \
  -o timeline.html
```

```bash
# Composite action steps are expanded by default in the CLI
# (--expand-composite-actions true, --expand-composite-actions-threshold 0).
# You can customize the threshold or disable expansion:
node cli.ts \
  https://github.com/OWNER/REPO/actions/runs/RUN_ID \
  -t $(gh auth token) \
  --format html \
  --expand-composite-actions-threshold 20 \
  -o timeline.html
```

- **HTML output (`--format html`, default)**: Writes a standalone `.html` file (or prints HTML to STDOUT) that you can open directly in any web browser—no external tools or internet connection required.
- **Mermaid output (`--format mermaid`)**: Writes Mermaid Markdown to a file or STDOUT. To preview it locally, use one of:
  - Online editor: [Mermaid Live Editor](https://mermaid-js.github.io/mermaid-live-editor/)
  - VS Code built-in Mermaid preview (since 1.121): [release notes](https://code.visualstudio.com/updates/v1_121#_mermaid-diagrams-in-markdown-preview-and-notebooks)
  - Local CLI: [mermaid-cli](https://github.com/mermaid-js/mermaid-cli)

# DEVELOPMENT

## Setup

```
mise install
npm install
```

# DEBUG

If you want to debug this action, first generate `dist/` then execute the local action:

```yaml
- uses: actions/checkout@v3
- uses: jdx/mise-action@d5574b52816a478f9d4e6529a3f6ff17a8a36785 # v5.2.8
- run: npm ci
- run: npm run build
- uses: ./
```

# LICENSE

MIT
