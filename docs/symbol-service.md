# Offline symbol service

The symbol service resolves static addresses from the ELF outputs of an explicitly
selected `cbuild-run.yml`. It works independently of active debug sessions. This
foundation does not yet connect to the Trace Generation or Live Watch UI.

## Ownership and API

Use `createSymbolService` from
`src/desktop/symbols/create-symbol-service.ts` inside the desktop extension.
Creating the service does not start any GDB workers. A desktop owner selects
its build file and releases its resources; UI integration is a separate step.

```ts
const service = createSymbolService();
try {
    await service.setBuildFile(absoluteBuildFile);
    const matches = await service.resolveSymbol('state.cpus[0].counter', {
        signal: controller.signal
    });
    // matches: readonly [pname: string | undefined, address: `0x${string}`][]
} finally {
    await service.dispose();
}
```

The owner retains `SymbolService`, which provides `setBuildFile`, `resolveSymbol`
and asynchronous, idempotent `dispose`. Consumers needing lookup only should
receive `SymbolResolver`. The public contracts in `src/symbols/symbol-service.ts`
contain no VS Code or CDT types. `createSymbolService({ gdbPath })` can explicitly
override the bundled GDB executable.

A match is a successful processor/address tuple. An unnamed single processor has
`pname === undefined`. Addresses are lowercase hexadecimal strings without leading
zeroes; `0x0` is a valid address. A missing tuple can mean an unknown symbol, a
runtime-dependent expression, a missing image, or an unavailable worker. It must
not be interpreted as proof that a processor does not own the symbol.

Expressions may contain identifiers, C++ namespace qualification, parentheses,
member access and constant non-negative integer array indices. Calls, casts,
pointer dereferences, assignments and variable indices are rejected. Expressions
that require target memory, including indexing a pointer, produce no match.
There is no active-debug-session fallback.

## Layers and updates

- `CbuildRunSymbolService` watches the selected build file, reads fresh metadata
  and reconciles one handler per used processor. Debug topology takes precedence
  over system resources. When neither supplies processors, output ownership is
  used, falling back to one unnamed processor. Unqualified images apply to every
  processor. Changing the build path disposes the previous handlers.
- `GdbSymbolHandler` owns the complete image set for one processor and watches
  each ELF for creation, modification and deletion. It starts GDB on the first
  supported lookup and retains that worker. A change to the images invalidates
  pending results immediately. The next supported lookup reloads the available
  images once, even after multiple rebuilds. Later lookups reuse those symbols
  until the images change again.
- `CdtGdbSymbolSession` uses the pinned CDT backend and MI parser. It loads
  `symbol-file` and `add-symbol-file` with `-o` section relocation. It never loads
  an executable target or connects to a debug server. Initialization files,
  auto-loaded scripts, debuginfod and function calls are disabled.

`CbuildRunReader.getSymbolImages()` resolves paths relative to the build file and
retains `pname` and `load-offset`. It includes only outputs with `type: elf` and
`load: symbols` or `image+symbols`. An omitted load mode defaults to
`image+symbols`; `image` and `none` are excluded. ELF contents may have an `.axf`
extension. Relocations must be safe YAML integers and are exposed as `bigint`.
The existing `getElfFilePaths()` keeps its original path-only behavior.

## Concurrency and failures

Queries and reloads are serialized within a processor; processors run in parallel.
There is no expression-result cache. Build and ELF generations discard results
that became stale while an operation was pending.

Startup and symbol loading have a 30 second timeout; queries have a 5 second
timeout. Operational failures are logged and omit that processor's match. A
failed worker is stopped and retried on the next lookup without an automatic
restart loop. Other processors may still return matches. A missing or invalid
build file clears old metadata, while its watch remains available for recovery.

An `AbortSignal` rejects the caller with `AbortError`. Cancellation does not kill
a shared worker: an already issued command is drained before the next command.
Disposal invalidates pending requests, removes watches and awaits process shutdown
with bounded TERM/KILL waits. Operations after disposal reject a lifecycle error.

## Dependency boundary and verification

CDT 2.0.0 is pinned because the bridge imports its backend modules directly.
Upgrades must recheck these imports and MI behavior. The package also contains
serial-port and native PTY support. Backend imports keep those modules outside
the dependency graph used by the service; avoid importing the root barrel.
The development dependency installation still follows CDT's upstream install
script, which builds its unused PTY helper on Linux.

Unit tests inject file access, build snapshots, loggers and backend sessions to
exercise reloads, cancellation, timeouts, processor changes and disposal. Desktop
composition tests cover real YAML parsing and watch routing. Backend tests cover
symbol-only commands, relocation and address validation. Real offline checks with
the two Zephyr M55 images confirmed different `main` addresses, HE-only `testVar`,
static member/index lookup, rejected target-memory access and section relocation.
