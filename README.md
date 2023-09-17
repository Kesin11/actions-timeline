# actions-timeline

A Action shows timeline of a workflow in a run summary.

TODO: sample screenshot

## USAGE

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    # Register this action before your build step. It will then be executed at the end of the job post-processing.
    - uses: Kesin11/actions-timeline@v1
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
    - uses: Kesin11/actions-timeline@v1
```

## How it works

TODO

## Support GHES

You can set `GITHUB_API_URL` environment variable to use this action with GHES.

```yaml
- uses: Kesin11/actions-timeline@v1
  env:
    GITHUB_API_URL: 'https://github.example.com/api/v3'
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
