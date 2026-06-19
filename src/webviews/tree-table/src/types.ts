/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

/**
 * Shared protocol types for tree-table webview ↔ extension host communication.
 *
 * This is the **single source of truth** — both the webview bundle and the
 * extension host import from here (the extension host via a tsconfig path or
 * a re-export wrapper).
 *
 * The types are pure interfaces with no runtime code and no DOM/Node
 * dependencies, so they can be compiled under either environment.
 */

/**
 * A single flattened row sent from the extension host to the webview.
 *
 * The table has two columns: a "name" column (with tree indentation and
 * expand/collapse toggle) and a "value" column.
 */
export interface FlatRow {
    /** Unique row identifier (stable across updates). */
    id: string;
    /** Nesting depth (0 = root). */
    depth: number;
    /** Whether this node has children (controls the toggle icon). */
    hasChildren: boolean;
    /** Whether this node is currently expanded (children visible). */
    expanded: boolean;
    /** Display text for the name column (first column, carries indent + toggle). */
    name: string;
    /** Display text for the value column. */
    value: string;
    /** Bold heading for the tooltip. Falls back to `name` when omitted. */
    tooltipHead?: string;
    /** Body text for the tooltip. Falls back to `value` when omitted. */
    tooltipBody?: string;
    /**
     * When `true` the row shows a lock/unlock button (opt-in per row).
     * Only evaluated when the table-level `features.lockable` flag is set.
     */
    lockEnabled?: boolean;
    /** Current lock state of this row (`true` = locked / excluded from updates). */
    locked?: boolean;
}

/** Optional feature flags that control which UI capabilities the table exposes. */
export interface TreeTableFeatures {
    /** When `true`, rows whose {@link FlatRow.lockEnabled} is set show a lock button. */
    lockable?: boolean;
    /** Tooltip shown on the lock button when the row is unlocked. Defaults to `"Lock"`. */
    lockTooltip?: string;
    /** Tooltip shown on the lock button when the row is locked. Defaults to `"Unlock"`. */
    unlockTooltip?: string;
}

/** Structured tooltip content rendered as React text nodes. */
export interface TooltipContent {
    /** Bold heading line. */
    head?: string;
    /** Body lines, each rendered on its own line. */
    bodyLines?: string[];
}

/** Extension host → webview: replace entire table contents. */
export interface TreeTableUpdateMessage {
    type: 'update';
    rows: FlatRow[];
    loading: boolean;
    /** Optional feature flags; omit to use defaults. */
    features?: TreeTableFeatures;
    /** Text shown when `rows` is empty and `loading` is false. */
    emptyMessage?: string;
    /** Reset persisted table UI state such as column width and scroll position. */
    resetViewState?: boolean;
}

export type HostToWebviewMessage = TreeTableUpdateMessage;

/** Webview → extension host: user toggled a row's expansion state. */
export interface ToggleMessage {
    type: 'toggle';
    id: string;
    expanded: boolean;
}

/** Webview → extension host: user clicked the lock button on a row. */
export interface LockMessage {
    type: 'lock';
    id: string;
}

/** Webview → extension host: React app has mounted and is ready to receive data. */
export interface ReadyMessage {
    type: 'ready';
}

export type WebviewToHostMessage = ToggleMessage | LockMessage | ReadyMessage;
