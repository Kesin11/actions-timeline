# actions-timeline

An Action shows timeline of a GitHub Action workflow in the run summary page.

`actions-timeline` is a tool that allows developers to visualize the sequence of
jobs and steps that occur during a GitHub Actions workflow. By examining the
timeline, you can quickly identify any issues or bottlenecks in your workflow,
and make adjustments as needed to improve performance and efficiency.

![Sample screenshot](https://user-images.githubusercontent.com/1324862/268660777-5ee9fffd-6ef7-4960-9632-3589cb7138e1.png)

## USAGE

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    # Register this action before your build step. It will then be executed at the end of the job post-processing.
    - uses: Kesin11/actions-timeline@v2
      with:
        # e.g.: ${{ secrets.MY_PAT }}
        # Default: ${{ github.token }}
        github-token: ''
        # Show waiting runner time in the timeline.
        # Default: true
        show-waiting-runner: true

    # Your build steps...
```

If your workflow has many jobs, you should run `actions-timeline` in the job
that takes the most time, or create an independent job for `actions-timeline` in
a last of the workflow.

```yaml
jobs:
  build-1:
  build-2:
  build-3:
  
  actions-timeline:
    needs: [build-1, build-2, build-3]
    runs-on: ubuntu-latest
    steps:
    - uses: Kesin11/actions-timeline@v2
```

## How it works

`actions-timeline` fetches the jobs and steps of the workflow run from the
GitHub API, and then generates a timeline with
[mermaid gantt diagrams](https://mermaid.js.org/syntax/gantt.html). Thanks to
the GitHub flavored markdown that can visualize mermaid diagrams, the timeline
is displayed in the run summary page.

This action is run on post-processing of the job, so you should register this
action before your build step. If you register this action after your build
step, the timeline will not include other post-processing steps.

## Support GHES

`actions-timeline` can also work on GitHub Enterprise Server(GHES). It needs
`GITHUB_API_URL` environment variable to access your GHES. Thanks to GitHub
Actions, it sets
[default environment variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables)
so you do not need to make any code changes.

## Known issues

### In some cases, the workflow requires `actions:read' permission.

Sometimes the
`actions:read' permission is needed in the workflow to fetch workflow jobs and steps. If you see the following error, you need to add the`actions:read'
permission to your workflow.

```yaml
jobs:
  build:
    permissions:
      actions: read
    runs-on: ubuntu-latest
    steps:
    - uses: Kesin11/actions-timeline@v2
```

### 'Waiting for a runner' step is not supported < GHES v3.9

GET `workflow_job` API response does not contain `created_at` field in
[GHES v3.8](https://docs.github.com/en/enterprise-server@3.8/rest/actions/workflow-jobs#get-a-job-for-a-workflow-run),
it is added from
[GHES v3.9](https://docs.github.com/en/enterprise-server@3.9/rest/actions/workflow-jobs?apiVersion=2022-11-28).
So it is not possible to calculate the elapsed time the runner is waiting for a
job, `actions-timeline` omits `Waiting for a runner` step in the timeline.

# Similar works

- https://github.com/Kesin11/github_actions_otel_trace
- https://github.com/inception-health/otel-export-trace-action
- https://github.com/runforesight/workflow-telemetry-action

# CLI tool

`actions-timeline` is also available as a CLI tool. You can use it with
`deno run` command.

```bash
deno run --allow-net --allow-write \
  https://raw.githubusercontent.com/Kesin11/actions-timeline/main/cli.ts \
  https://github.com/Kesin11/actions-timeline/actions/runs/8021493760/attempts/1 \
  -t $(gh auth token) \
  -o output.md

# Fetch latest attempt if ommit attempts
deno run --allow-net --allow-write \
  https://raw.githubusercontent.com/Kesin11/actions-timeline/main/cli.ts \
  https://github.com/Kesin11/actions-timeline/actions/runs/8021493760/ \
  -t $(gh auth token) \
  -o output.md

# GHES
deno run --allow-net --allow-write \
  https://raw.githubusercontent.com/Kesin11/actions-timeline/main/cli.ts \
  https://YOUR_ENTERPRISE_HOST/OWNER/REPO/actions/runs/RUN_ID/attempts/1 \
  -t $(gh auth token -h YOUR_ENTERPRISE_HOST) \
  -o output.md
```

`cli.ts` just outputs the markdown to file or STDOUT, so you have to use other
tools to visualize mermaid diagrams.

- Online editor:
  [Mermaid Live Editor](https://mermaid-js.github.io/mermaid-live-editor/)
- VSCode extension:
  [Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)
- Local terminal: [mermaid-cli](https://github.com/mermaid-js/mermaid-cli)

# DEVELOPMENT

## Setup

```
asdf install
deno task setup:githooks
```

# DEBUG

If you want to debug this action, first generate `dist/` then execute own
action.

```yaml
- uses: actions/checkout@v3
- uses: denoland/setup-deno@v1
- run: deno task bundle
- uses: ./
```

# LICENSE

MIT
