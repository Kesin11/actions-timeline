---
name: verify-composite-expansion
description: Verify composite action expansion output by comparing CLI-generated mermaid charts with actual GitHub Actions logs. Use when testing or debugging the --expand-composite-actions feature, especially to confirm that the original composite bar remains visible while expanded child rows appear beneath it. Triggered by requests like "composite展開を検証", "verify composite expansion", or "compare CLI output with logs".
---

# Verify Composite Expansion

Verify the correctness of composite action expansion by comparing CLI output with actual GitHub Actions logs.

## Workflow

### 1. Run the verification script

Use `scripts/verify_composite.sh` to collect all data at once.

```bash
.claude/skills/verify-composite-expansion/scripts/verify_composite.sh <org/repo> <run_id> [output_dir]
```

Example:

```bash
.claude/skills/verify-composite-expansion/scripts/verify_composite.sh directus/directus 21767232907 .
```

The script performs:

1. Run CLI with `--expand-composite-actions=true` → `{repo}_composite.md`
2. Run CLI without the flag → `{repo}.md`
3. `gh run view` to list jobs
4. Fetch step details for each job via GitHub API
5. Show first 50 lines of logs for each job

### 2. Running individual commands manually

With composite expansion:

```bash
deno run --allow-net --allow-env --allow-write cli.ts --token "$(gh auth token)" --expand-composite-actions=true "https://github.com/{org}/{repo}/actions/runs/{run_id}" -o {repo}_composite.md
```

Without composite expansion:

```bash
deno run --allow-net --allow-env --allow-write cli.ts --token "$(gh auth token)" "https://github.com/{org}/{repo}/actions/runs/{run_id}" -o {repo}.md
```

List jobs:

```bash
gh run -R {org}/{repo} view {run_id}
```

Get step details for a job (gaps in step numbers help identify composite internals in logs):

```bash
gh api repos/{org}/{repo}/actions/jobs/{job_id} --jq '.steps[] | "\(.number)\t\(.name)\t\(.started_at)\t\(.completed_at)"'
```

View actual logs for a job:

```bash
gh run -R {org}/{repo} view --job={job_id} --log
```

### 3. Verification checklist

When comparing outputs, check:

- **Without expansion**: Composite actions appear as a single step (e.g., "Prepare (25s)")
- **With expansion**: The original composite step still appears, and expanded child rows with `(sub)` prefix are rendered beneath it
- **API step mapping**: The preserved composite parent should still line up with the API step list and workflow YAML
- **Time consistency**: Child row start/end times should fit within the parent composite duration, and the next top-level step should start after the parent completes
- **Log consistency**: Child row ordering and names should be traceable to the grouped job log blocks
