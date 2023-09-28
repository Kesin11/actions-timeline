# actions-timeline

An Action shows timeline of a GitHub Action workflow in the run summary page.

`actions-timeline` is a tool that allows developers to visualize the sequence of jobs and steps that occur during a GitHub Actions workflow. By examining the timeline, you can quickly identify any issues or bottlenecks in your workflow, and make adjustments as needed to improve performance and efficiency.

![Sample screenshot](https://user-images.githubusercontent.com/1324862/268660777-5ee9fffd-6ef7-4960-9632-3589cb7138e1.png)

## USAGE

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    # Register this action before your build step. It will then be executed at the end of the job post-processing.
    - uses: Kesin11/actions-timeline@v0
      with:
        # e.g.: ${{ secrets.MY_PAT }}
        # Default: ${{ github.token }}
        github-token: ''

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
  
  action-timeline:
    needs: [build-1, build-2, build-3]
    runs-on: ubuntu-latest
    steps:
    - uses: Kesin11/actions-timeline@v0
```

## How it works

`actions-timeline` fetches the jobs and steps of the workflow run from the GitHub API, and then generates a timeline with [mermaid gantt diagrams](https://mermaid.js.org/syntax/gantt.html). Thanks to the GitHub flavored markdown that can visualize mermaid diagrams, the timeline is displayed in the run summary page.

This action is run on post-processing of the job, so you should register this action before your build step. If you register this action after your build step, the timeline will not include other post-processing steps.

## Support GHES

You can set `GITHUB_API_URL` environment variable to use this action with GHES.

```yaml
- uses: Kesin11/actions-timeline@v0
  env:
    GITHUB_API_URL: 'https://github.example.com/api/v3'
```

## Known issues

### 'Waiting for a runner' step is not supported < GHES v3.9

GET `workflow_job` API response does not contain `created_at` field in [GHES v3.8](https://docs.github.com/en/enterprise-server@3.8/rest/actions/workflow-jobs#get-a-job-for-a-workflow-run), it is added from [GHES v3.9](https://docs.github.com/en/enterprise-server@3.9/rest/actions/workflow-jobs?apiVersion=2022-11-28). So it is not possible to calculate the elapsed time the runner is waiting for a job, `actions-timeline` inserts a dummy step instead.

# DEVELOPMENT

## Setup

```
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
