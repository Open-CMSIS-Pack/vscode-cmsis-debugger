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

import './trace-configuration.css';

type TraceControlKind = 'none' | 'text' | 'checkbox' | 'select' | 'multi-select' | 'readonly';

interface TraceConfigurationRow {
    id: string;
    label: string;
    path: (string | number)[];
    depth: number;
    kind: 'map' | 'sequence' | 'scalar';
    control: TraceControlKind;
    value?: string;
    checked?: boolean;
    options?: string[];
    selectedOptions?: string[];
    hasChildren: boolean;
    expanded: boolean;
    removable: boolean;
    addChildKind?: 'data' | 'start' | 'stop' | 'generic-map' | 'generic-scalar';
    description?: string;
}

interface TraceConfigurationState {
    fileName?: string;
    rows: TraceConfigurationRow[];
    loading: boolean;
    dirty: boolean;
    emptyMessage?: string;
    errorMessage?: string;
}

interface TraceUpdateMessage {
    type: 'update';
    state: TraceConfigurationState;
}

type HostToWebviewMessage = TraceUpdateMessage;

type WebviewToHostMessage =
    | { type: 'ready' }
    | { type: 'refresh' }
    | { type: 'save' }
    | { type: 'openFile' }
    | { type: 'toggle'; id: string; expanded: boolean }
    | { type: 'updateValue'; path: (string | number)[]; value: string | boolean | string[] }
    | { type: 'addItem'; path: (string | number)[]; addChildKind: NonNullable<TraceConfigurationRow['addChildKind']> }
    | { type: 'removeItem'; path: (string | number)[] };

interface VsCodeApi {
    postMessage(message: WebviewToHostMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();
const root = document.getElementById('root');

/**
 * post sends one typed browser action to the extension host. Keeping all
 * postMessage calls behind this small helper makes it obvious which messages
 * leave the sandbox and keeps the rest of the renderer free of acquireVsCodeApi
 * details.
 */
function post(message: WebviewToHostMessage): void {
    vscodeApi.postMessage(message);
}

/**
 * createElement builds one DOM element with optional class names. The webview
 * renders user-controlled YAML labels and values, so the code uses DOM text
 * nodes instead of string-built HTML to avoid accidental markup injection.
 */
function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    return element;
}

/**
 * createIcon returns a codicon span for toolbar and row actions. The extension
 * shell loads codicon.css, so the browser bundle only needs to create the
 * standard codicon class names.
 */
function createIcon(name: string): HTMLSpanElement {
    const icon = createElement('span', `codicon codicon-${name}`);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

/**
 * clearElement removes every child from an element before a fresh render. The
 * state from the extension host is authoritative, so full replacement is
 * simpler and less error-prone than incremental DOM patching for this view.
 */
function clearElement(element: HTMLElement): void {
    while (element.firstChild) {
        element.firstChild.remove();
    }
}

/**
 * renderApp is the top-level renderer for each host update. It creates the
 * toolbar, status line, and table for the current state and replaces the root
 * contents in one pass.
 */
function renderApp(state: TraceConfigurationState): void {
    if (!root) {
        return;
    }
    clearElement(root);
    const surface = createElement('main', 'table-surface');
    surface.append(createToolbar(), createStatus(state));
    if (state.loading) {
        surface.append(createEmptyState('Loading ctrace.yml...'));
    } else if (state.errorMessage) {
        surface.append(createEmptyState(state.errorMessage, true));
    } else if (state.rows.length === 0) {
        surface.append(createEmptyState(state.emptyMessage ?? 'No trace configuration loaded.'));
    } else {
        surface.append(createTable(state.rows));
    }
    root.append(surface);
}

/**
 * createToolbar builds the view-level controls. Save asks the extension host
 * to persist the current ctrace document, Open lets the user choose a ctrace
 * file, and Expand/Collapse send row toggle messages for every row currently
 * rendered in the table.
 */
function createToolbar(): HTMLElement {
    const toolbar = createElement('div', 'tree-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Trace configuration controls');
    toolbar.append(
        createToolbarButton('save', 'Save ctrace.yml', () => post({ type: 'save' })),
        createToolbarButton('folder-opened', 'Open ctrace.yml', () => post({ type: 'openFile' })),
        createToolbarButton('expand-all', 'Expand all', () => toggleAllRows(true)),
        createToolbarButton('collapse-all', 'Collapse all', () => toggleAllRows(false))
    );
    return toolbar;
}

/**
 * createToolbarButton creates a consistent icon button for the toolbar. The
 * callback is attached directly because toolbar buttons do not need row path
 * metadata.
 */
function createToolbarButton(iconName: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = createElement('button', 'icon-button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.append(createIcon(iconName));
    button.addEventListener('click', onClick);
    return button;
}

/**
 * toggleAllRows broadcasts expand/collapse messages for each expandable row in
 * the rendered table. The host owns expansion state, so the webview reports
 * each requested transition and waits for the next state update.
 */
function toggleAllRows(expanded: boolean): void {
    document.querySelectorAll<HTMLTableRowElement>('tr[data-row-id][data-has-children="true"]').forEach(row => {
        post({
            type: 'toggle',
            id: row.dataset.rowId ?? '',
            expanded
        });
    });
}

/**
 * createStatus renders the selected filename and unsaved/saved state. Saves are
 * currently immediate, but the flag is still shown so future debounced writes
 * can reuse the same status surface.
 */
function createStatus(state: TraceConfigurationState): HTMLElement {
    const status = createElement('div', 'trace-status');
    const file = createElement('span', 'trace-file');
    file.textContent = state.fileName ?? 'No ctrace.yml selected';
    const dirty = createElement('span', state.dirty ? 'status-warn' : 'status-ok');
    dirty.textContent = state.dirty ? 'Saving' : 'Synced';
    status.append(file, dirty);
    return status;
}

/**
 * createEmptyState renders loading, empty, and error messages in the same table
 * surface. The isError flag only changes styling; message text comes from the
 * extension host.
 */
function createEmptyState(message: string, isError = false): HTMLElement {
    const empty = createElement('div', isError ? 'empty-state error-state' : 'empty-state');
    empty.textContent = message;
    return empty;
}

/**
 * createTable builds the two-column tree table shown in the mockup. Rows are
 * already flattened by the host, so this function only creates headers and one
 * table row per TraceConfigurationRow.
 */
function createTable(rows: TraceConfigurationRow[]): HTMLTableElement {
    const table = createElement('table', 'option-tree-table');
    table.setAttribute('aria-label', 'CMSIS trace configuration');
    table.append(createTableHead(), createTableBody(rows));
    return table;
}

/**
 * createTableHead creates the static Label/Selection header row. It is kept as
 * a function to mirror createTableBody and keep renderApp easy to scan.
 */
function createTableHead(): HTMLTableSectionElement {
    const thead = createElement('thead');
    const row = createElement('tr');
    const label = createElement('th');
    label.textContent = 'Label';
    const selection = createElement('th');
    selection.textContent = 'Selection';
    row.append(label, selection);
    thead.append(row);
    return thead;
}

/**
 * createTableBody renders all rows from the host. It uses a document fragment
 * style flow by appending to tbody directly, which is plenty small for trace
 * configuration trees and keeps the code simple.
 */
function createTableBody(rows: TraceConfigurationRow[]): HTMLTableSectionElement {
    const tbody = createElement('tbody');
    rows.forEach(row => tbody.append(createRow(row)));
    return tbody;
}

/**
 * createRow renders one YAML node as a tree-table row. Group classes follow the
 * mockup styling for maps/sequences, while scalar rows stay visually lighter.
 */
function createRow(row: TraceConfigurationRow): HTMLTableRowElement {
    const tr = createElement('tr', row.kind === 'scalar' ? 'tree-row' : 'tree-row group-row section-row');
    tr.dataset.rowId = row.id;
    tr.dataset.hasChildren = String(row.hasChildren);
    tr.append(createLabelCell(row), createSelectionCell(row));
    if (row.hasChildren) {
        tr.tabIndex = 0;
        tr.setAttribute('aria-expanded', String(row.expanded));
        tr.addEventListener('click', event => {
            if (event.target instanceof HTMLElement && event.target.closest('.multi-select')) {
                return;
            }
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) {
                return;
            }
            post({ type: 'toggle', id: row.id, expanded: !row.expanded });
        });
        tr.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                post({ type: 'toggle', id: row.id, expanded: !row.expanded });
            }
        });
    }
    return tr;
}

/**
 * createLabelCell renders indentation, expand/collapse affordance, row label,
 * remove button, and optional metadata. It keeps all non-editing controls in
 * the first column so the Selection column can focus on YAML values.
 */
function createLabelCell(row: TraceConfigurationRow): HTMLTableCellElement {
    const cell = createElement('td');
    const wrapper = createElement('div', 'tree-label');
    const title = createElement('div', `node-title depth-${Math.min(row.depth, 5)}`);
    const prefix = createElement('span', 'node-prefix');
    prefix.textContent = row.hasChildren ? row.expanded ? 'v' : '>' : '';
    const label = createElement('span', 'node-text');
    label.textContent = row.label;
    title.append(prefix, label);
    if (row.removable) {
        title.append(createRemoveButton(row));
    }
    wrapper.append(title);
    if (row.description) {
        const meta = createElement('span', 'node-meta');
        meta.textContent = row.description;
        wrapper.append(meta);
    }
    cell.append(wrapper);
    return cell;
}

/**
 * createRemoveButton builds the per-sequence-item delete button. It stops event
 * propagation so clicking delete does not also toggle the row expansion state.
 */
function createRemoveButton(row: TraceConfigurationRow): HTMLButtonElement {
    const button = createElement('button', 'icon-button node-action');
    button.type = 'button';
    button.title = 'Remove item';
    button.setAttribute('aria-label', `Remove ${row.label}`);
    button.append(createIcon('trash'));
    button.addEventListener('click', event => {
        event.stopPropagation();
        post({ type: 'removeItem', path: row.path });
    });
    return button;
}

/**
 * createSelectionCell chooses the correct editor for a row. Maps and sequences
 * mostly render add buttons or an intentionally empty value cell because their
 * purpose is structural; scalars render text, checkbox, or select controls
 * depending on host-provided metadata.
 */
function createSelectionCell(row: TraceConfigurationRow): HTMLTableCellElement {
    const cell = createElement('td', 'selection-cell');
    if (row.addChildKind) {
        cell.append(createAddButton(row));
        return cell;
    }
    switch (row.control) {
        case 'checkbox':
            cell.append(createCheckbox(row));
            break;
        case 'select':
            cell.append(createSelect(row));
            break;
        case 'multi-select':
            cell.append(createMultiSelect(row));
            break;
        case 'text':
            cell.append(createTextInput(row));
            break;
        case 'readonly':
            cell.append(createReadonly(row.value ?? ''));
            break;
        case 'none':
        default:
            break;
    }
    return cell;
}

/**
 * createAddButton renders the plus button for editable YAML sequences. The
 * host decides what placeholder object should be appended based on addChildKind.
 */
function createAddButton(row: TraceConfigurationRow): HTMLButtonElement {
    const button = createElement('button', 'icon-button add-button');
    button.type = 'button';
    button.title = 'Add item';
    button.setAttribute('aria-label', `Add item to ${row.label}`);
    button.append(createIcon('add'));
    button.addEventListener('click', event => {
        event.stopPropagation();
        post({ type: 'addItem', path: row.path, addChildKind: row.addChildKind ?? 'generic-map' });
    });
    return button;
}

/**
 * createCheckbox renders boolean-like scalar values. The host accepts booleans
 * directly and serializes them back to YAML.
 */
function createCheckbox(row: TraceConfigurationRow): HTMLLabelElement {
    const label = createElement('label', 'control-line');
    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.checked ?? false;
    checkbox.setAttribute('aria-label', row.label);
    checkbox.addEventListener('change', () => {
        post({ type: 'updateValue', path: row.path, value: checkbox.checked });
    });
    label.append(checkbox);
    return label;
}

/**
 * createSelect renders scalar fields with known small vocabularies, such as
 * access and output. Changes are saved immediately through the host.
 */
function createSelect(row: TraceConfigurationRow): HTMLSelectElement {
    const select = createElement('select');
    select.setAttribute('aria-label', row.label);
    (row.options ?? []).forEach(optionValue => {
        const option = createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        option.selected = optionValue === row.value;
        select.append(option);
    });
    select.addEventListener('change', () => {
        post({ type: 'updateValue', path: row.path, value: select.value });
    });
    return select;
}

/**
 * createMultiSelect renders a compact dropdown checklist for fields where the
 * ctrace schema accepts multiple choices. It keeps its checked values locally
 * while the dropdown is open and posts the full selected array after each
 * checkbox change so the host can rewrite the corresponding YAML structure.
 */
function createMultiSelect(row: TraceConfigurationRow): HTMLElement {
    const details = createElement('details', 'multi-select');
    const summary = createElement('summary', 'multi-select-summary');
    const selectedValues = new Set(row.selectedOptions ?? []);

    /**
     * updateSummary mirrors the selected checklist values into the collapsed
     * dropdown label so users can scan the current configuration without
     * opening each multi-select control.
     */
    const updateSummary = () => {
        summary.textContent = selectedValues.size > 0
            ? Array.from(selectedValues).join(', ')
            : 'None';
    };
    updateSummary();
    const menu = createElement('div', 'multi-select-menu');
    (row.options ?? []).forEach(optionValue => {
        const label = createElement('label', 'multi-select-option');
        const checkbox = createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedValues.has(optionValue);
        checkbox.setAttribute('aria-label', `${row.label} ${optionValue}`);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedValues.add(optionValue);
            } else {
                selectedValues.delete(optionValue);
            }
            updateSummary();
            post({ type: 'updateValue', path: row.path, value: Array.from(selectedValues) });
        });
        const text = createElement('span');
        text.textContent = optionValue;
        label.append(checkbox, text);
        menu.append(label);
    });
    details.append(summary, menu);
    return details;
}

/**
 * createTextInput renders editable scalar text. It commits on blur or Enter so
 * users can type without saving the file after every keystroke.
 */
function createTextInput(row: TraceConfigurationRow): HTMLInputElement {
    const input = createElement('input');
    input.type = 'text';
    input.value = row.value ?? '';
    input.spellcheck = false;
    input.setAttribute('aria-label', row.label);
    let lastCommittedValue = input.value;
    const commit = () => {
        if (input.value === lastCommittedValue) {
            return;
        }
        lastCommittedValue = input.value;
        post({ type: 'updateValue', path: row.path, value: input.value });
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            commit();
            input.blur();
        }
    });
    return input;
}

/**
 * createReadonly renders non-editable values as compact status pills. This is
 * used mostly for map/sequence rows where the value column communicates node
 * kind or future extension points rather than accepting direct edits.
 */
function createReadonly(text: string): HTMLSpanElement {
    const span = createElement('span', 'pill');
    span.textContent = text;
    return span;
}

/**
 * onMessage receives replacement state from the extension host. The host sends
 * complete snapshots, so every update simply re-renders the webview.
 */
function onMessage(event: MessageEvent<HostToWebviewMessage>): void {
    if (event.data.type === 'update') {
        renderApp(event.data.state);
    }
}

window.addEventListener('message', onMessage);
post({ type: 'ready' });
