# Fix generated trace file path escape

## Summary

Keep generated trace files in the solution’s `.cmsis` directory. Reject unsafe `target-set` names and filesystem links that could redirect generated file reads or writes.

## Implementation

- In `src/cbuild-run/cbuild-run-file-locator.ts`, preserve missing, empty, and `<default>` target sets. Reject named sets containing `/`, `\`, `:`, or control characters. Resolve the output path and require its parent to be exactly the expected `.cmsis` directory. Reject invalid names rather than sanitizing them.
- In `src/views/trace-configuration/trace-configuration-generated-ctrace-file-manager.ts`, use `lstat` to reject a symlinked `.cmsis` directory or existing output file before reading, and check again immediately before writing. Check `.cmsis` after creating it. Use a testable filesystem boundary for these checks.
- Keep public method signatures and filenames for valid target sets unchanged. Let existing command and watcher error handlers surface validation failures.

## Tests

- Cover traversal with `/` and `\`, invalid characters, and valid named and default target sets.
- Verify that symlinked directories and output files are rejected before a read or write, and that files outside the solution remain unchanged.
- Run `npm run build` and `npm run test`.

## Assumption

This protects against malicious file contents and existing links. A separate local process racing to replace directory entries during a write is outside this fix.
