# CMSIS JSON Active-Solution Watch Plan

## Goal

Observe `.vscode/cmsis.json` once for the extension lifetime and notify
solution-scoped features only when its resolved `activeSolution` changes.
Touches, formatting changes, unrelated properties, and active-target-only
changes must not cause a reconfiguration.

## Delivery Rule

Implement and validate the required tests in each pull request. Submit only
PR 1 initially and stop for review before starting PR 2.

## PR 1 — Shared CMSIS JSON Observation

- Introduce `CmsisJsonWatcher` in `src/cmsis-files`.
- Activate and dispose one shared watcher from extension activation using the
  shared `FileWatchManager`.
- Own one `.vscode/cmsis.json` create/change/delete registration with the ID
  `workspace.cmsis-json`.
- Record the normalized, resolved `activeSolution` at activation.
- Expose `onDidChangeActiveSolution` with the previous path, current path,
  and a monotonically increasing generation.
- On every file event, reread and compare only `activeSolution`:
    - Emit only when the resolved value changes.
    - Ignore changes to other CMSIS JSON properties, including active target.
    - Preserve the last known selection after malformed or unreadable content.
    - Emit `undefined` when a valid file clears the selection or the file is
      deleted.
- Preserve the existing `CBuildRunFileLocator` query APIs and fallback
  behavior. Direct consumers may receive the shared locator, but do not yet
  change their solution-scoped watches.

### PR 1 Tests and Validation

- Cover watcher registration and disposal, initial baseline, active-solution
  changes, clear/delete transitions, unrelated and active-target-only changes,
  read/parse failure retention, and recovery.
- Cover extension activation and disposal of exactly one shared watcher.
- Use the common `makeFactory` test-fixture mechanism for the watcher fixture.
- Run focused watcher and extension tests, `npm run build`, and `npm run test`.

## PR 2 — Reconfigure Solution-Scoped Consumers

- Subscribe `TraceConfigurationFileWatcher`, `CTraceController`, and
  `PyTsController` to the shared active-solution event.
- For trace configuration, remove previous cbuild-index, cbuild-run, and
  current `ctrace.yml` watches; install an index watch for the new solution;
  then resolve an existing cbuild-run file. Ignore callbacks from previous
  generations.
- Keep the previous trace document visible and editable without a live file
  watch until new output replaces it.
- For CTrace and PyTS, replace enabled `.trace` and
  `.cmsis/*.ctrace.{yml,yaml}` watches for the new solution. Invalidate old
  generations and clear pending or observed state.
- Retain cbuild-index watching for active-target and output-path changes. An
  unchanged `activeSolution` emits no watcher event.

### PR 2 Tests and Validation

- Cover trace-configuration watch replacement, stale-event rejection,
  immediate and deferred output discovery, and a retained editable prior view
  without an old-file watch.
- Cover CTrace and PyTS enabled-watch replacement, disabled no-op behavior,
  and stale pending callbacks.
- Run focused feature tests, `npm run build`, and `npm run test`.

## Deferred Follow-up TODOs

- Move file operations from `CBuildRunFileLocator` to `utils`; rename
  `readFile` to `readYamlFile` there.
- Merge the `cbuild-run` folder into `cmsis-files`.
- Rename `cbuild-run-file-locator` to `cbuild-run-locator` for naming
  consistency.
- Split `cbuild-run-file-locator` into separate modules by handled file type.
- Move file watchers from trace modules to a central location for reuse by
  other features.
