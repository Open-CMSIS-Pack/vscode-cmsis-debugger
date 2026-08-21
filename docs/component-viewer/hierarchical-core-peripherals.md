# Hierarchical Core Peripherals

This document describes the planned hierarchical grouping for the Core Peripherals and Component Viewer tree views.

## Motivation

Some core peripherals (e.g. SysTick, NVIC) exist in multiple security variants on processors with TrustZone. In multi-core systems (e.g. M7/M4, M4/M0+) each core has its own set of peripherals. Currently each SCVD file produces a flat root node in the tree. This PR introduces a **hierarchy layer** that groups SCVD content by core and peripheral name, with optional security-zone sub-nodes.

The same hierarchy layer applies to both the **Core Peripherals** view and the **Component Viewer** view, since both share the same base class (`ComponentViewerBase`) and instance management.

## Target Tree Structure

### Single-Core without TrustZone (e.g. Cortex-M4)

The simplest case — no grouping needed, flat list of peripherals (current behaviour):

```text
Core Peripherals
├── Memory Protection Unit
│   └── (SCVD file content)
├── Nested Vectored Interrupt Controller
│   └── (SCVD file content)
├── System Config and Control
│   └── (SCVD file content)
├── System Tick Timer
│   └── (SCVD file content)
└── Fault Reports
    └── (SCVD file content)
```

### Single-Core with TrustZone (e.g. Cortex-M33)

Peripherals with security variants are grouped under one name with Secure/Non-Secure sub-nodes:

```text
Core Peripherals
├── Memory Protection Unit
│   └── (SCVD file content)
├── Nested Vectored Interrupt Controller
│   ├── Secure
│   │   └── (SCVD file content)
│   └── Non-Secure
│       └── (SCVD file content)
├── System Config and Control
│   └── (SCVD file content)
├── System Tick Timer
│   ├── Secure
│   │   └── (SCVD file content)
│   └── Non-Secure
│       └── (SCVD file content)
└── Fault Reports
    └── (SCVD file content)
```

### Multi-Core (e.g. M7/M4, M4/M0+, M0+/M0+)

In multi-core systems the **processor core** becomes the highest grouping level. Each core has its own set of core peripherals, which in turn may have TrustZone variants:

```text
Core Peripherals
├── Cortex-M7
│   ├── System Tick Timer
│   │   └── (SCVD file content)
│   ├── Nested Vectored Interrupt Controller
│   │   └── (SCVD file content)
│   └── …
└── Cortex-M4
    ├── System Tick Timer
    │   └── (SCVD file content)
    ├── Nested Vectored Interrupt Controller
    │   └── (SCVD file content)
    └── …
```

With both multi-core **and** TrustZone the full hierarchy is three levels deep:

```text
Core Peripherals
├── Cortex-M33 (Core 0)
│   ├── System Tick Timer
│   │   ├── Secure
│   │   │   └── (SCVD file content)
│   │   └── Non-Secure
│   │       └── (SCVD file content)
│   └── …
└── Cortex-M33 (Core 1)
    ├── System Tick Timer
    │   ├── Secure
    │   │   └── (SCVD file content)
    │   └── Non-Secure
    │       └── (SCVD file content)
    └── …
```

For single-core targets the core level is omitted and the tree stays flat.

### Component Viewer (Multi-Core)

The Component Viewer displays CMSIS-Pack (or user) -provided SCVD files (e.g. RTX5, Network stack). In multi-core targets the same core-level grouping applies:

```text
Component Viewer
├── Cortex-M7
│   ├── RTX5
│   │   └── (SCVD file content)
│   └── …
└── Cortex-M4
    ├── Network
    │   └── (SCVD file content)
    └── …
```

For single-core targets the core level is omitted (current behaviour preserved).

## Architecture — Shared Hierarchy Layer

### Current Architecture

```text
ScvdCollector.getScvdFilePaths() → string[]
        ↓
ComponentViewerBase.readScvdFiles() → flat instances
        ↓
ComponentViewerBase.updateInstances() → flat roots → setRoots()
```

Both views (`ComponentViewer` and `CorePeripherals`) are thin wrappers around `ComponentViewerBase`. They differ only in which `ScvdCollector` they provide:

| View | Collector | Source |
|------|-----------|--------|
| Core Peripherals | `CorePeripheralsScvdCollector` | Built-in index YAML, filtered by CPU type/features |
| Component Viewer | `ComponentViewerScvdCollector` | `cbuild-run.yml` system-descriptions |

### New Architecture

A `HierarchyBuilder` is inserted between instance collection and `setRoots()`:

```text
ScvdCollector.getScvdFilePaths() → ScvdFileInfo[]
        ↓
ComponentViewerBase.readScvdFiles() → flat instances (with metadata)
        ↓
ComponentViewerBase.updateInstances()
        ↓
HierarchyBuilder.build(instances, processorCount)
        ↓
category nodes wrapping instances → setRoots()
```

The `HierarchyBuilder` lives in `ComponentViewerBase` and is used by **both** views automatically.

### Transparency for Single-Core

The `HierarchyBuilder` decides at runtime how much hierarchy to apply:

| Condition | Result |
|-----------|--------|
| 1 processor, no groups | Returns flat roots unchanged (= current behaviour) |
| 1 processor, with groups | Inserts peripheral-group level only (S/NS) |
| N processors, no groups | Inserts core level only |
| N processors, with groups | Inserts core level + peripheral-group level |

When no grouping is needed, the builder passes roots through unmodified — zero overhead, fully transparent.

## ScvdCollector Interface Change

The `ScvdCollector` interface is extended to return metadata alongside file paths:

```ts
export interface ScvdFileInfo {
    filePath: string;
    processorName?: string;  // Multi-core grouping (from pname)
    group?: string;          // Peripheral grouping key (e.g. "System Tick Timer")
    variant?: string;        // Variant label (e.g. "Secure")
}

export interface ScvdCollector {
    getScvdFilePaths(session: GDBTargetDebugSession): Promise<ScvdFileInfo[]>;
}
```

### CorePeripheralsScvdCollector

Populates `processorName`, `group`, and `variant` from the core-peripherals index YAML and the active processor info.

### ComponentViewerScvdCollector

Populates `processorName` from the `pname` field in `cbuild-run.yml` system-descriptions. The `group` and `variant` fields remain `undefined` (user SCVD files typically have no S/NS variants).

## Index Schema Changes (Core Peripherals)

The `core-peripherals-index.yml` gains `group` and `variant` fields:

```yaml
core-peripherals:
  - file: System_Tick_Timer.scvd
    cpu-type: "*"
    group: System Tick Timer          # grouping key
    variant: Secure                   # label shown in the tree
    cpu-features:
      trustzone: present
  - file: System_Tick_Timer_NS.scvd
    cpu-type: "*"
    group: System Tick Timer
    variant: Non-Secure
    cpu-features:
      trustzone: present
  - file: System_Tick_Timer.scvd
    cpu-type: "*"
    # No group/variant → flat node (non-TrustZone fallback)
```

The `CorePeripheralEntryType` interface gains:

```ts
export interface CorePeripheralEntryType {
    file: string;
    'cpu-type'?: string | string[];
    'cpu-features'?: CpuFeaturesType;
    info?: string;
    group?: string;    // NEW – peripheral grouping key
    variant?: string;  // NEW – label for the sub-node (e.g. "Secure")
}
```

## Lock/Unlock Behaviour

The lock button is driven by `isRootInstance` and `isLocked` flags on `ScvdGuiInterface`. These are depth-agnostic — any node at any level can receive the lock button.

| Scenario | Lock button on |
|----------|---------------|
| Single-core, no groups | SCVD root node (current behaviour) |
| Single-core, with groups (S/NS) | Variant sub-nodes (Secure / Non-Secure) |
| Multi-core | SCVD root nodes within each core group |

Category nodes (core nodes, peripheral group nodes) are **never** lockable. They have no statement engine and no update cycle.

## Required Code Changes

### 1. Shared types

| File | Change |
|------|--------|
| `component-viewer-base.ts` | Define `ScvdFileInfo` interface. Update `ScvdCollector` to return `ScvdFileInfo[]`. |

### 2. Index types & schema (`core-peripherals/`)

| File | Change |
|------|--------|
| `core-peripherals-index-types.ts` | Add `group?: string` and `variant?: string` to `CorePeripheralEntryType`. |
| `core-peripherals-index.schema.json` | Add `group` and `variant` as optional string properties. |
| `core-peripherals-index.yml` | Add entries with `group`/`variant` for TrustZone-aware peripherals. Create NS-variant SCVD files where needed. |

### 3. Collectors return metadata

| File | Change |
|------|--------|
| `core-peripherals-scvd-collector.ts` | Return `ScvdFileInfo[]` with `filePath`, `group`, `variant`, and `processorName`. |
| `component-viewer-scvd-collector.ts` | Return `ScvdFileInfo[]` with `filePath` and `processorName` (from `pname` in cbuild-run system-descriptions). |

### 4. Category node

| File | Change |
|------|--------|
| **New:** `category-node.ts` | A lightweight class implementing `ScvdGuiInterface` that acts as a synthetic grouping node. Holds children but has no statement engine or lock/unlock behaviour. Used for both core-level and peripheral-group-level nodes. |

### 5. HierarchyBuilder in controller (`component-viewer-base.ts`)

| File | Change |
|------|--------|
| `component-viewer-base.ts` | Add `HierarchyBuilder` (or inline logic) in `updateInstances()`. After collecting SCVD roots, build hierarchy: **core → group → variant**. For single-core without groups, pass roots through unchanged. Adjust `handleLockInstance()` to resolve the correct `ManagedInstance` from deeper nodes. |

### 6. Tree view (`component-viewer-tree-view.ts`)

No structural changes expected — the `TreeDataProvider` already renders arbitrary `ScvdGuiInterface` hierarchies. Minor adjustments may be needed for:

- **Icons**: category nodes could use a distinct icon to differentiate from SCVD roots.
- **Filter**: the existing fuzzy-match filter already walks descendants, so category nodes will be included automatically.

## Open Questions

- Should the category node display an aggregated value (e.g. number of children)?
- How should refresh/lock interact with category nodes? Current proposal: locking applies per-SCVD-instance, not per category.
- Do we need new SCVD files for NS variants, or can one SCVD file be parameterised by base address?
- In multi-core: how is the core label derived — from `pname` in `cbuild-run.yml`, from the core type, or a combination (e.g. "Cortex-M33 (Core 0)")?
- In multi-core: should the collector run once per core (each core may match different peripherals based on its own `cpu-type` and `cpu-features`)?
