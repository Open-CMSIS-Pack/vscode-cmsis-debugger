# Offline symbol service

The symbol service resolves static addresses from the ELF outputs of an explicitly
selected `cbuild-run.yml`. It works independently of active debug sessions.
Add to Data Trace uses the matches to select or narrow its processor choices.

## Ownership and API

Use `createSymbolService` from
`src/desktop/symbols/create-symbol-service.ts` inside the desktop extension.
The desktop extension creates the service for Trace Generation. Its provider
selects the build file through the existing active-solution/build watcher and
awaits service disposal at shutdown. The normal extension bundle includes the
service; no separate webpack entry is required.

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

The owner retains `SymbolService`, which provides `setBuildFile`, `resolveSymbol`,
`lookupSymbol` and asynchronous, idempotent `dispose`. Consumers needing lookup
only should receive `SymbolResolver`. The public contracts in `src/symbols/symbol-service.ts`
contain no VS Code or CDT types. `createSymbolService({ gdbPath })` can explicitly
override the bundled GDB executable.

A match is a successful processor/address tuple. An unnamed single processor has
`pname === undefined`. Addresses are lowercase hexadecimal strings without leading
zeroes; `0x0` is a valid address. A missing tuple can mean an unknown symbol, a
runtime-dependent expression, a missing image, or an unavailable worker. It must
not be interpreted as proof that a processor does not own the symbol.

`lookupSymbol` returns `{ matches, unavailableProcessors }`. It distinguishes
confirmed misses from missing images, failed workers and timeouts. Consumers
filtering processor choices must retain unavailable processors alongside matches.
The address-only `resolveSymbol` API continues to return successful tuples only.

Expressions may contain identifiers, C++ namespace qualification, parentheses,
member access and constant non-negative integer array indices. Calls, casts,
pointer dereferences, assignments and variable indices are rejected. Expressions
that require target memory, including indexing a pointer, produce no match.
There is no active-debug-session fallback.

## Add to Data Trace

Editor, Watch and Live Watch actions share the same processor selection flow.
Successful matches narrow the eligible destinations while retaining processors
whose lookup was unavailable. One remaining destination is selected automatically;
several destinations appear in the picker, preserving trace configuration order.
With no matches, including unsupported expressions or an unavailable GDB, the full
eligible processor list remains available. A match at `0x0` is valid. A missing ELF
keeps its processor selectable even when another processor resolves the symbol.

Filtering applies only to the generated trace file associated with the selected
build. Manually opening another trace file retains its full eligible processor
list. An omitted destination `pname` uses the build's processor identity only when
build metadata identifies a single processor, including root-level `ctrace.data`.

Trace capability checks still apply. If symbol matches exist but none belongs to
a Data Trace destination and no eligible processor has an unavailable lookup, the
command reports that no matching processor supports Data Trace. A lookup is a
confirmed miss only when every configured image was loaded successfully. A match
from an available image remains valid even if another image is missing.

Build selection is propagated even when the generated file does not exist yet,
so the service can watch for its creation. Solution changes clear the previous
build and release its workers. Changing build context hides Data Trace actions
until its generated trace configuration has loaded. Pending lookups and picker
selections are rejected if the build, images or trace document changes before
insertion, including unsaved in-memory edits. Freshness is checked again after
the final asynchronous document refresh. No live debug session is queried for
processor filtering.

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
timeout. Operational failures are logged and mark that processor as unavailable
in detailed lookup results. A failed worker is stopped and retried on the next
lookup without an automatic restart loop. Other processors may still return
matches. A missing or invalid build file clears old metadata, while its watch
remains available for recovery.

An `AbortSignal` rejects the caller with `AbortError`. Cancellation does not kill
a shared worker: an already issued command is drained before the next command.
Disposal invalidates pending requests, removes watches and awaits process shutdown
with bounded TERM/KILL waits. Operations after disposal reject a lifecycle error.

## Dependency boundary and verification

CDT 2.0.0 is pinned because the bridge imports its backend modules directly.
Upgrades must recheck these imports and MI behavior. The package also contains
serial-port and native PTY support, but those modules are excluded from the
production extension bundle by using backend imports instead of its root barrel.
The development dependency installation still follows CDT's upstream install
script, which builds its unused PTY helper on Linux.

Unit tests inject file access, build snapshots, loggers and backend sessions to
exercise reloads, cancellation, timeouts, processor changes and disposal. Desktop
composition tests cover real YAML parsing and watch routing. Backend tests cover
symbol-only commands, relocation and address validation. Real offline checks with
the two Zephyr M55 images confirmed different `main` addresses, HE-only `testVar`,
static member/index lookup, rejected target-memory access and section relocation.
