# Node.js Migration Release Notes

The Deno-to-Node.js migration is a major-release migration.

## Compatibility

Normal Action and primary CLI cases use fixed compatibility fixtures. Tests
compare Mermaid output, the Action summary, log order, annotations, CLI stdout
and stderr, output files, and exit codes byte-for-byte. Existing help and error
behavior remains semantically compatible. Error messages, stack traces, and
rare failure paths are best-effort rather than guaranteed byte-for-byte.

## Breaking changes

- The raw GitHub URL `deno run` CLI invocation is no longer supported.
- The CLI is not published to npm and has no `bin` entry.
- Use the cloned repository with Node.js 24:

  ```bash
  npm install
  node cli.ts URL --token TOKEN
  ```

- Deno is no longer a runtime, test, formatter, linter, or build dependency.

## Rollback

The previous major tag remains unchanged. Before publishing the new major tag,
record its current commit as the rollback target. If the new major has a
release-blocking problem:

1. Do not move the previous major tag.
2. Point users to the previous major tag or commit for the Action.
3. Use the previous Deno-based CLI checkout while the Node CLI is repaired.
4. Publish a revert or patch under the new major line rather than overwriting
   the previous major tag.
