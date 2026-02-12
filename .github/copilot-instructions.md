# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development

- `deno task bundle` - Build the bundle (outputs to dist/ folder)
- `deno task bundle:commit` - Bundle and commit changes
- `deno fmt` - Format code
- `deno lint` - Lint code
- `deno test` - Run tests

### CLI tool

- `deno run --allow-net --allow-write --allow-env=GITHUB_API_URL cli.ts` - Run CLI version

## Architecture

This project is a GitHub Action that visualizes GitHub Actions workflow execution timelines using Mermaid gantt charts.

### Key Components

- **action.yml** - GitHub Action configuration (inputs, runs settings)
- **src/main.ts** - Main phase (does nothing - dummy file)
- **src/post.ts** - Post-processing phase with actual logic
- **src/workflow_gantt.ts** - Mermaid gantt chart generation logic
- **src/github.ts** - GitHub API client
- **cli.ts** - CLI version entry point

### Processing Flow

1. post.ts fetches workflow run and workflow jobs from GitHub API
2. workflow_gantt.ts generates Mermaid gantt chart
3. Outputs to GitHub Actions summary

### Directory Structure

- `src/` - TypeScript source code
- `dist/` - Bundled JavaScript for node20
- `npm/` - npm package build output
- `tests/` - Test files and fixtures

## Code Conventions

### General

- Prefer `const` over `let`. Use ternary operator or other expressions to avoid `let` where possible
- Do not make function parameters optional if they are never called with `undefined` in practice
- Use Octokit REST API client instead of raw `fetch` for GitHub API calls

### Tests

- Use `functionName.name` instead of string literals in `Deno.test()` (e.g., `Deno.test(parseLogBlocks.name, ...)`)
- Compare objects directly with `assertEquals` instead of asserting individual fields
- Do not use `for` loops for asserting. Compare the entire expected object directly
- Extract magic numbers into named variables

### Functional Style

- Prefer `map`, `flatMap`, `filter` over imperative `for` loops where readability allows
- Use `new Map(array)` with `Array.filter` instead of manually building Maps in loops

## Important Notes

- This Action runs in the **post-processing** phase, so main.ts does nothing
- The dist/ folder is updated via `deno task bundle`
- Includes a 1-second delay for GitHub API result stability
