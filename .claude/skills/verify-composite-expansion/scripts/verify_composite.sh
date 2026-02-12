#!/bin/bash
# Verify composite action expansion by comparing CLI output with actual GitHub Actions logs.
#
# Usage:
#   verify_composite.sh <org/repo> <run_id> [output_dir]
#
# Example:
#   verify_composite.sh directus/directus 21767232907 ./output

set -euo pipefail

REPO="${1:?Usage: verify_composite.sh <org/repo> <run_id> [output_dir]}"
RUN_ID="${2:?Usage: verify_composite.sh <org/repo> <run_id> [output_dir]}"
OUTPUT_DIR="${3:-.}"
REPO_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"

RUN_URL="https://github.com/${REPO}/actions/runs/${RUN_ID}"
COMPOSITE_OUT="${OUTPUT_DIR}/${REPO##*/}_composite.md"
NORMAL_OUT="${OUTPUT_DIR}/${REPO##*/}.md"

echo "=== Verify Composite Expansion ==="
echo "Repo: ${REPO}"
echo "Run ID: ${RUN_ID}"
echo "Output dir: ${OUTPUT_DIR}"
echo ""

mkdir -p "${OUTPUT_DIR}"

# Step 1: Generate mermaid with composite expansion
echo "--- [1/5] Generating mermaid WITH composite expansion ---"
deno run --allow-net --allow-env --allow-write \
  "${REPO_DIR}/cli.ts" \
  --token "$(gh auth token)" \
  --expand-composite-actions=true \
  "${RUN_URL}" \
  -o "${COMPOSITE_OUT}"
echo "  -> ${COMPOSITE_OUT}"
echo ""

# Step 2: Generate mermaid without composite expansion
echo "--- [2/5] Generating mermaid WITHOUT composite expansion ---"
deno run --allow-net --allow-env --allow-write \
  "${REPO_DIR}/cli.ts" \
  --token "$(gh auth token)" \
  "${RUN_URL}" \
  -o "${NORMAL_OUT}"
echo "  -> ${NORMAL_OUT}"
echo ""

# Step 3: List jobs
echo "--- [3/5] Fetching run info ---"
gh run -R "${REPO}" view "${RUN_ID}"
echo ""

# Step 4: Get job step details via API
echo "--- [4/5] Job steps from GitHub API ---"
JOB_IDS=$(gh api "repos/${REPO}/actions/runs/${RUN_ID}/jobs" --jq '.jobs[].id')
for JOB_ID in ${JOB_IDS}; do
  echo "  Job ID: ${JOB_ID}"
  gh api "repos/${REPO}/actions/jobs/${JOB_ID}" \
    --jq '.steps[] | "    \(.number)\t\(.name)\t\(.started_at)\t\(.completed_at)"'
  echo ""
done

# Step 5: Show logs for each job (first 50 lines per job)
echo "--- [5/5] Job logs (first 50 lines per job) ---"
for JOB_ID in ${JOB_IDS}; do
  echo "  === Job ${JOB_ID} ==="
  gh run -R "${REPO}" view --job="${JOB_ID}" --log 2>&1 | head -50
  echo "  ..."
  echo ""
done

echo "=== Done ==="
echo "Compare the following files:"
echo "  Composite: ${COMPOSITE_OUT}"
echo "  Normal:    ${NORMAL_OUT}"
