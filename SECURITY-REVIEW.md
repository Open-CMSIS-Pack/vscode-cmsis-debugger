# Security review

Reviewed on 2026-10-09. This was a static review of the extension's file,
process, webview, and packaging boundaries. No end-to-end exploit was run.

## Findings

### High: Generated trace files can escape the solution directory

The generated `cbuild-run.yml` file supplies `target-set`. The trace file
locator appends that value to a filename without validating it as a filename
component, then joins it beneath the solution's `.cmsis` directory. The trace
file manager can create the resulting directory and write the file.

A value such as `../../../../outside` can resolve outside the workspace. The
written filename still ends in `.ctrace.yml`, which limits the files that can
be targeted. This path is reached when the extension processes a generated
`cbuild-run.yml` file in a trusted workspace. VS Code disables extensions that
have not declared untrusted workspace support in Restricted Mode.

Validate `target-set` as a single filename component. Also verify that the
resolved output path remains inside the expected `.cmsis` directory before
creating directories or writing.

Evidence: [YAML parse and `target-set` read](src/cbuild-run/cbuild-run-reader.ts#L53),
[filename construction](src/cbuild-run/cbuild-run-file-locator.ts#L215),
[generated file write](src/views/trace-configuration/trace-configuration-generated-ctrace-file-manager.ts#L272),
and [VS Code Workspace Trust behavior](https://code.visualstudio.com/api/extension-guides/workspace-trust).

### Medium: Markdown filenames reach a shell command

`npm run check:links` passes Markdown filenames returned by `globby` to
`execFile` with `shell: true`. A filename containing shell metacharacters can
execute a command when someone runs the script on a malicious checkout.

Invoke the installed checker through Node without a shell, passing the filename
as an argument. Keep the filename out of a shell command string.

Evidence: [file discovery and process invocation](scripts/check-links.ts#L123)
and [Node.js `execFile` guidance](https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html#child_processexecfilefile-args-options-callback).

### Medium: Release packages select a mutable nightly executable

The release workflow runs `download-tools:nightly`. That script requests a
pyOCD workflow artifact at packaging time rather than using the pinned pyOCD
release version in `package.json`. Consequently, the executable included in a
release VSIX is not fixed by the release commit.

Pin the pyOCD artifact to a reviewed workflow run or use the pinned release
asset, and verify the downloaded artifact's digest before packaging.

Evidence: [release trigger and packaging workflow](.github/workflows/ci.yml#L26),
[nightly download step](.github/workflows/ci.yml#L225),
[download scripts and pinned versions](package.json#L1061), and
[workflow artifact selection](scripts/download-tools.ts#L79).

### Low: Debug logs can expose credentials

The debug configuration provider logs the entire original and resolved debug
configuration, as well as the server command line. Environment values and
command arguments may contain credentials, which can then appear in shared
diagnostic logs.

Log selected non-sensitive fields or redact secrets and command arguments.

Evidence: [debug configuration logging](src/debug-configuration/gdbtarget-configuration-provider.ts#L72)
and [call sites](src/debug-configuration/gdbtarget-configuration-provider.ts#L156).

## Dependency audit

`npm audit --json` and `npm audit --omit=dev --json` reported zero known
vulnerabilities for the current lockfile on 2026-10-09. This does not assess
the downloaded tool binaries.
