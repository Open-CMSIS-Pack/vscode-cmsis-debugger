# File Watcher Unification Plan

## Goal

Make `FileWatchManager` the sole owner of file watcher installation and
removal. All watched files are assumed to be workspace files, so the extension
will use VS Code file-system watchers exclusively.

## Implementation Changes

- Keep `FileWatchManager` as the extension-lifetime registry. Its existing
  `addWatch` and `removeWatch` operations are sufficient for the required
  create, change, and delete callbacks.
- Pass the single manager created during extension activation through
  `TraceConfigurationWebviewProvider` and `TraceConfigurationModel` to
  `TraceConfigurationFileWatcher`.
- Replace the direct `vscode.workspace.createFileSystemWatcher` registrations
  in `TraceConfigurationFileWatcher` with named manager registrations for:
    - cbuild index files;
    - the resolved generated `*.cbuild-run.yml` file; and
    - the active `*.ctrace.yml` file.
- Replace the trace configuration watcher's local disposable arrays with
  `removeWatch(id)` calls, while retaining its current generation and resolved
  file-name checks to reject callbacks from obsolete watches.
- Move active `ctrace.yml` event handling into `TraceConfigurationFileWatcher`.
  Each managed create/change/delete callback must call
  `CTraceYamlFile.reloadIfChanged()` and preserve the existing success and
  error callbacks.
- Remove the generic watcher API from `TextFileAdapter`, `YamlDomFile`, and
  `CTraceYamlFile`; remove `NodeTextFileAdapter.watch()` and
  `WorkspaceTextFileAdapter.watch()` with it. Read, write, stat, and reload
  stamp behavior remain unchanged.

## Tests

- Extend `FileWatchManager` coverage only if the migration exposes a missing
  registration/removal behavior.
- Update trace-configuration watcher and model tests to inject the manager and
  trigger registered callbacks rather than depending on direct watcher setup.
- Cover replacement/removal of the generated cbuild-run and active ctrace
  registrations, including stale callbacks, deletion, and extension/model
  disposal.
- Remove or replace the YAML DOM Node watcher test; retain tests for reload
  stamp detection through the managed trace-configuration watcher.

## Assumptions

- Every file that needs watching is accessible through the VS Code workspace
  file-system API.
- No production code requires a standalone Node `fs.watch` fallback.
- Existing file-event semantics, including reacting to create, change, and
  delete events, remain unchanged.
