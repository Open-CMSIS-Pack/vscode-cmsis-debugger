# Hierarchical Core Peripherals

This document describes the planned hierarchical grouping of core peripherals in the Core Peripherals tree view.

## Motivation

Some core peripherals (e.g. SysTick, NVIC) exist in multiple security variants on processors with TrustZone. Currently each SCVD file produces a flat root node in the tree. This PR introduces intermediate **category nodes** that group related SCVD content under a single peripheral name, with security-zone sub-nodes beneath it.

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

For single-core targets the core level is omitted and the tree stays as shown above.

## Index Schema Changes

The `core-peripherals-index.yml` needs a `group` field (and optionally a `variant` label) per entry so that multiple SCVD files can be grouped under one peripheral name:

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

## Required Code Changes

### 1. Index types & schema (`core-peripherals/`)

| File | Change |
|------|--------|
| `core-peripherals-index-types.ts` | Add `group?: string` and `variant?: string` to `CorePeripheralEntryType`. |
| `core-peripherals-index.schema.json` | Add `group` and `variant` as optional string properties. |
| `core-peripherals-index.yml` | Add entries with `group`/`variant` for TrustZone-aware peripherals. Create NS-variant SCVD files where needed. |

### 2. Collector returns metadata (`CorePeripheralsScvdCollector`)

| File | Change |
|------|--------|
| `core-peripherals-scvd-collector.ts` | `getScvdFilePaths()` currently returns `string[]`. Change to return an enriched type (e.g. `CorePeripheralFileInfo[]`) that carries `filePath`, `group`, and `variant` alongside the path. |

### 3. Category node (`ScvdGuiInterface` / new class)

| File | Change |
|------|--------|
| **New:** `core-peripheral-category-node.ts` | A lightweight class implementing `ScvdGuiInterface` that acts as a synthetic grouping node. It holds children (the actual SCVD roots or variant sub-nodes) but has no statement engine or lock/unlock behaviour. |

### 4. Build hierarchy in controller (`component-viewer-base.ts`)

| File | Change |
|------|--------|
| `component-viewer-base.ts` | In `updateInstances()`, after collecting SCVD roots, build a hierarchy: **core → group → variant**. In multi-core targets (more than one processor in `cbuild-run.yml`), create a top-level core node per processor. Within each core (or at root level for single-core), group entries by `group` key. For groups with a single entry, keep the flat root. For groups with multiple entries, wrap them in a category node and insert variant sub-nodes. Pass the resulting hierarchy to `setRoots()`. |

### 5. Tree view (`component-viewer-tree-view.ts`)

No structural changes expected — the `TreeDataProvider` already renders arbitrary `ScvdGuiInterface` hierarchies. Category nodes will simply appear as collapsible parents. Minor adjustments may be needed for:

- **Icons**: category nodes could use a distinct icon to differentiate from SCVD roots.
- **Lock/unlock**: category nodes are not lockable (only leaf instances are).
- **Filter**: the existing fuzzy-match filter already walks descendants, so category nodes will be included automatically.

## Open Questions

- Should the category node display an aggregated value (e.g. number of children)?
- How should refresh/lock interact with category nodes? Current proposal: locking applies per-SCVD-instance, not per category.
- Do we need new SCVD files for NS variants, or can one SCVD file be parameterised by base address?
- In multi-core: how is the core label derived — from `pname` in `cbuild-run.yml`, from the core type, or a combination (e.g. "Cortex-M33 (Core 0)")?
- In multi-core: should the collector run once per core (each core may match different peripherals based on its own `cpu-type` and `cpu-features`)?
