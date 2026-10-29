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

import './trace-configuration.css';

import type {
    TraceConfigurationRow,
    TraceConfigurationState,
    TraceHostToWebviewMessage,
    TraceWebviewToHostMessage,
} from '../../../views/trace-configuration/trace-configuration-protocol';

type MultiSelectControl = {
    signature: string;
    updateSelectedOptions(selectedOptions: readonly string[]): void;
};

interface TraceViewState {
    labelColumnWidth?: number;
}

interface VsCodeApi {
    postMessage(message: TraceWebviewToHostMessage): void;
    getState(): TraceViewState | undefined;
    setState(state: TraceViewState): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();
const root = document.getElementById('root');
let openMultiSelectId: string | undefined;
let renderedState: TraceConfigurationState | undefined;
/** Prevents DOM replacement from committing an unfinished user edit. */
let replacingContents = false;
const multiSelectControls = new WeakMap<HTMLDetailsElement, MultiSelectControl>();
const DEFAULT_LABEL_COLUMN_WIDTH = 52;
const MIN_LABEL_COLUMN_WIDTH = 15;
const MAX_LABEL_COLUMN_WIDTH = 85;
const savedLabelColumnWidth = vscodeApi.getState()?.labelColumnWidth;
let labelColumnWidth = typeof savedLabelColumnWidth === 'number' && Number.isFinite(savedLabelColumnWidth)
    ? Math.min(MAX_LABEL_COLUMN_WIDTH, Math.max(MIN_LABEL_COLUMN_WIDTH, savedLabelColumnWidth))
    : DEFAULT_LABEL_COLUMN_WIDTH;
const columnResizeHandle = createColumnResizeHandle();
const columnResizeObserver = new ResizeObserver(updateColumnResizeHandle);

function updateColumnResizeHandle(): void {
    document.documentElement.style.setProperty('--label-col-width', `${labelColumnWidth}%`);
    const scrollRegion = root?.querySelector<HTMLElement>('.option-tree-scroll');
    if (scrollRegion) {
        columnResizeHandle.style.left = `${scrollRegion.clientWidth * labelColumnWidth / 100}px`;
    }
    columnResizeHandle.setAttribute('aria-valuenow', String(labelColumnWidth));
}

function setLabelColumnWidth(width: number): void {
    labelColumnWidth = Math.min(MAX_LABEL_COLUMN_WIDTH, Math.max(MIN_LABEL_COLUMN_WIDTH, width));
    updateColumnResizeHandle();
    vscodeApi.setState({ ...vscodeApi.getState(), labelColumnWidth });
}

function createColumnResizeHandle(): HTMLDivElement {
    const handle = createElement('div', 'column-resize-handle');
    handle.tabIndex = 0;
    handle.title = 'Resize columns. Double-click to reset.';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', 'Label column width');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-valuemin', String(MIN_LABEL_COLUMN_WIDTH));
    handle.setAttribute('aria-valuemax', String(MAX_LABEL_COLUMN_WIDTH));
    handle.addEventListener('dblclick', () => setLabelColumnWidth(DEFAULT_LABEL_COLUMN_WIDTH));
    handle.addEventListener('keydown', event => {
        const step = event.shiftKey ? 10 : 1;
        switch (event.key) {
            case 'ArrowLeft': setLabelColumnWidth(labelColumnWidth - step); break;
            case 'ArrowRight': setLabelColumnWidth(labelColumnWidth + step); break;
            case 'Home': setLabelColumnWidth(MIN_LABEL_COLUMN_WIDTH); break;
            case 'End': setLabelColumnWidth(MAX_LABEL_COLUMN_WIDTH); break;
            case 'Enter': setLabelColumnWidth(DEFAULT_LABEL_COLUMN_WIDTH); break;
            default: return;
        }
        event.preventDefault();
    });
    handle.addEventListener('pointerdown', event => {
        const scrollRegion = root?.querySelector<HTMLElement>('.option-tree-scroll');
        if (event.button !== 0 || !event.isPrimary || !scrollRegion || scrollRegion.clientWidth === 0) {
            return;
        }
        event.preventDefault();
        handle.focus({ preventScroll: true });
        const pointerId = event.pointerId;
        const grabOffset = event.clientX - scrollRegion.getBoundingClientRect().left
            - scrollRegion.clientWidth * labelColumnWidth / 100;
        document.body.classList.add('resizing');
        const stopResize = (): void => {
            document.body.classList.remove('resizing');
            document.removeEventListener('pointermove', moveResize);
            document.removeEventListener('pointerup', endResize);
            document.removeEventListener('pointercancel', endResize);
            window.removeEventListener('blur', stopResize);
        };
        const moveResize = (moveEvent: PointerEvent): void => {
            const currentScrollRegion = root?.querySelector<HTMLElement>('.option-tree-scroll');
            if (moveEvent.pointerId === pointerId && currentScrollRegion && currentScrollRegion.clientWidth > 0) {
                const width = moveEvent.clientX - currentScrollRegion.getBoundingClientRect().left - grabOffset;
                setLabelColumnWidth(width / currentScrollRegion.clientWidth * 100);
            }
        };
        const endResize = (endEvent: PointerEvent): void => {
            if (endEvent.pointerId === pointerId) {
                stopResize();
            }
        };
        document.addEventListener('pointermove', moveResize);
        document.addEventListener('pointerup', endResize);
        document.addEventListener('pointercancel', endResize);
        window.addEventListener('blur', stopResize);
    });
    return handle;
}

/**
 * post sends one typed browser action to the extension host. Keeping all
 * postMessage calls behind this small helper makes it obvious which messages
 * leave the sandbox and keeps the rest of the renderer free of acquireVsCodeApi
 * details.
 */
function post(message: TraceWebviewToHostMessage): void {
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
function createIcon(name: string, extraClass?: string): HTMLSpanElement {
    const icon = createElement('span', `codicon codicon-${name} trace-config${extraClass ? ' ' + extraClass : ''}`);
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
 * closeOpenMultiSelect clears the persisted open dropdown and closes any
 * rendered multi-select details elements. It is called for outside clicks and
 * Escape so checkbox changes can keep the active dropdown open across host
 * state refreshes.
 */
function closeOpenMultiSelect(): void {
    openMultiSelectId = undefined;
    document.querySelectorAll<HTMLDetailsElement>('details.multi-select[open]').forEach(details => {
        details.open = false;
    });
}

/** Captures an active edit so validation refreshes retain its draft and caret. */
function preserveTextInput(state: TraceConfigurationState): (() => void) | undefined {
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement) || input.type !== 'text' || !root?.contains(input)
        || state.focusedRowId || renderedState?.fileName !== state.fileName) {
        return;
    }
    const rowId = input.closest<HTMLTableRowElement>('tr[data-row-id]')?.dataset.rowId;
    const previousRow = renderedState?.rows.find(row => row.id === rowId);
    const nextRow = state.rows.find(row => row.id === rowId);
    if (!previousRow || !nextRow || nextRow.control !== 'text' || nextRow.controlDisabledReason
        || (previousRow.value ?? '') !== (nextRow.value ?? '')
        || JSON.stringify(getValuePath(previousRow)) !== JSON.stringify(getValuePath(nextRow))) {
        return;
    }
    const { value, selectionStart, selectionEnd, selectionDirection } = input;
    return () => {
        const row = Array.from(root.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]'))
            .find(candidate => candidate.dataset.rowId === rowId);
        const replacement = row?.querySelector<HTMLInputElement>('input[type="text"]');
        if (replacement) {
            replacement.value = value;
            replacement.focus({ preventScroll: true });
            replacement.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
        }
    };
}

/**
 * renderApp is the top-level renderer for each host update. It creates the
 * toolbar, status line, and table for the current state, reusing unchanged
 * multi-select controls when replacing the root contents.
 */
function renderApp(state: TraceConfigurationState): void {
    if (!root) {
        return;
    }
    const previousScrollRegion = root.querySelector<HTMLElement>('.option-tree-scroll');
    const scrollTop = previousScrollRegion?.scrollTop ?? 0;
    const scrollLeft = previousScrollRegion?.scrollLeft ?? 0;
    const menuScrollPositions = Array.from(root.querySelectorAll<HTMLElement>('.multi-select-menu'))
        .map(menu => ({ menu, scrollTop: menu.scrollTop, scrollLeft: menu.scrollLeft }));
    const activeElement = document.activeElement;
    const restoreTextInput = preserveTextInput(state);
    const focusedRowId = activeElement instanceof HTMLTableRowElement && root.contains(activeElement)
        ? activeElement.dataset.rowId
        : undefined;
    const surface = createElement('main', 'table-surface');
    surface.append(createHeader(state));
    const treeBody = createElement('div', 'option-tree-body');
    const scrollRegion = createElement('div', 'option-tree-scroll');
    if (state.loading) {
        scrollRegion.append(createEmptyState('Loading ctrace.yml...'));
    } else if (state.errorMessage) {
        scrollRegion.append(createEmptyState(state.errorMessage, true));
    } else if (state.rows.length === 0) {
        scrollRegion.append(createEmptyState(state.emptyMessage ?? 'No trace configuration loaded.'));
    } else {
        scrollRegion.append(createTable(state.rows));
    }
    treeBody.append(scrollRegion);
    if (!state.loading && !state.errorMessage && state.rows.length > 0) {
        treeBody.append(columnResizeHandle);
    }
    surface.append(treeBody);
    columnResizeObserver.disconnect();
    replacingContents = true;
    try {
        clearElement(root);
        root.append(surface);
        columnResizeObserver.observe(scrollRegion);
        updateColumnResizeHandle();
        scrollRegion.scrollTop = scrollTop;
        scrollRegion.scrollLeft = scrollLeft;
        if (!state.focusedRowId && activeElement instanceof HTMLElement && root.contains(activeElement)) {
            activeElement.focus({ preventScroll: true });
        }
        menuScrollPositions.forEach(position => {
            if (root.contains(position.menu)) {
                position.menu.scrollTop = position.scrollTop;
                position.menu.scrollLeft = position.scrollLeft;
            }
        });
        focusRow(state.focusedRowId ?? focusedRowId);
        renderedState = state;
        restoreTextInput?.();
    } finally {
        replacingContents = false;
    }
}

/**
 * focusRow brings a newly added row into view after a host-rendered state
 * refresh. The lookup avoids CSS escaping issues by comparing dataset values.
 */
function focusRow(rowId: string | undefined): void {
    if (!rowId) {
        return;
    }
    const row = Array.from(document.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]'))
        .find(candidate => candidate.dataset.rowId === rowId);
    if (!row) {
        return;
    }
    if (row.tabIndex < 0) {
        row.tabIndex = -1;
    }
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    row.focus({ preventScroll: true });
}

/**
 * createHeader places the file status above the scrolling tree body.
 */
function createHeader(state: TraceConfigurationState): HTMLElement {
    const header = createElement('div', 'trace-header');
    header.append(createStatus(state));
    if (state.sourceConflictMessage) {
        const notice = createElement('div', 'trace-notice');
        notice.textContent = state.sourceConflictMessage;
        notice.setAttribute('role', 'status');
        header.append(notice);
    }
    return header;
}

/**
 * createStatus renders the selected filename, dirty state, and pyTS validation
 * lifecycle without hiding the editable rows when validation fails.
 */
function createStatus(state: TraceConfigurationState): HTMLElement {
    const status = createElement('div', 'trace-status');
    const file = createElement('button', 'trace-file');
    file.type = 'button';
    file.textContent = getFileNameDisplayText(state);
    file.title = state.fileName ?? '';
    file.disabled = !state.fileName;
    file.setAttribute('aria-label', state.fileName ? `Open ${state.fileName}` : 'No ctrace.yml selected');
    file.addEventListener('click', () => post({ type: 'openCurrentFile' }));
    status.append(file, createStatusIcon(state));
    return status;
}

/** Displays validation progress and failures for both saved configurations and unsaved drafts. */
function createStatusIcon(state: TraceConfigurationState): HTMLSpanElement {
    let iconName = 'pass-filled';
    let label = 'saved';
    let statusClass = 'saved';
    if (state.validationState === 'failed') {
        iconName = 'error';
        label = 'error';
        statusClass = 'error';
    } else if (state.validationState === 'unavailable') {
        iconName = 'warning';
        label = 'validation unavailable';
        statusClass = 'unavailable';
    } else if (state.validationState === 'pending' || state.validationState === 'running') {
        iconName = 'sync';
        label = 'validating';
        statusClass = 'validating';
    } else if (state.dirty) {
        iconName = 'diff-modified';
        label = 'modified';
        statusClass = 'modified';
    }
    const icon = createIcon(iconName, `status-icon status-${statusClass}`);
    icon.title = state.validationMessage ? `${label}: ${state.validationMessage}` : label;
    icon.removeAttribute('aria-hidden');
    icon.setAttribute('aria-label', label);
    icon.setAttribute('role', 'img');
    return icon;
}

/**
 * getFileNameDisplayText preserves the absolute filename in state while
 * shortening the status label relative to the active solution or workspace.
 */
function getFileNameDisplayText(state: TraceConfigurationState): string {
    const basePath = state.solutionFolderPath ?? state.workspaceFolderPath;
    if (!state.fileName) {
        return 'No ctrace.yml selected';
    }
    const displayPath = basePath && state.fileName.startsWith(basePath)
        ? state.fileName.slice(basePath.length + 1)
        : state.fileName;
    // Keep leading punctuation, such as the dot in `.cmsis`, attached to the
    // left-to-right path while CSS uses RTL direction for left-side ellipsis.
    return `\u200e${displayPath}`;
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
 * createTable builds the label and selection columns. Rows are
 * already flattened by the host, so this function only creates headers and one
 * table row per TraceConfigurationRow.
 */
function createTable(rows: TraceConfigurationRow[]): HTMLTableElement {
    const table = createElement('table', 'option-tree-table');
    table.setAttribute('aria-label', 'CMSIS trace configuration');
    const columns = createElement('colgroup');
    columns.append(createElement('col', 'label-column'), createElement('col'));
    table.append(columns, createTableHead(), createTableBody(rows));
    return table;
}

/**
 * createTableHead creates the static Label/Selection header row. It is kept as
 * a function to mirror createTableBody and keep renderApp easy to scan.
 */
function createTableHead(): HTMLTableSectionElement {
    return createElement('thead');
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
            if (isRowToggleInteractiveTarget(event.target) || (event.detail !== 0 && pointerStartedInControl)) {
                return;
            }
            post({ type: 'toggle', id: row.id, expanded: !row.expanded });
        });
        tr.addEventListener('keydown', event => {
            if (isRowToggleInteractiveTarget(event.target)) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                post({ type: 'toggle', id: row.id, expanded: !row.expanded });
            }
        });
    }
    return tr;
}

/**
 * isRowToggleInteractiveTarget prevents clicks and key presses on controls from
 * falling through to the row-level expand/collapse handler.
 */
function isRowToggleInteractiveTarget(target: EventTarget | null): boolean {
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) {
        return true;
    }
    return target instanceof HTMLElement && Boolean(target.closest('.multi-select, .add-button-wrapper, .tooltip-wrapper'));
}

/**
 * createLabelCell renders indentation, expand/collapse affordance, row label,
 * optional debugging tooltip, remove button, and metadata. It keeps all
 * non-editing controls in the first column so the Selection column can focus
 * on YAML values.
 */
function createLabelCell(row: TraceConfigurationRow): HTMLTableCellElement {
    const cell = createElement('td', 'label-cell');
    const wrapper = createElement('div', 'tree-label');
    const title = createElement('div', `node-title depth-${Math.min(row.depth, 5)}`);
    const prefix = createElement('span', 'node-prefix');
    if (row.hasChildren) {
        prefix.append(createIcon(row.expanded ? 'chevron-down' : 'chevron-right', 'chevron'));
    }
    const label = createElement('span', 'node-text');
    label.textContent = row.label;
    if (row.labelTooltip) {
        label.title = row.labelTooltip;
    }
    title.append(prefix);
    if (row.validation) {
        title.append(createValidationIcon(row.validation.severity, row.validation.message));
    }
    title.append(label);
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

/** Creates the accessible, severity-colored validator marker for one row. */
function createValidationIcon(severity: 'info' | 'warning' | 'error', message: string): HTMLSpanElement {
    const wrapper = createElement('span', `tooltip-wrapper validation-icon validation-${severity}`);
    wrapper.tabIndex = 0;
    wrapper.dataset.tooltip = message;
    wrapper.setAttribute('aria-label', `${severity}: ${message}`);
    wrapper.append(createIcon(severity));
    return wrapper;
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
 * getValuePath returns the YAML path edited by the row's value control. Most
 * rows edit their own node, while promoted controls edit a child scalar from
 * their parent header row.
 */
function getValuePath(row: TraceConfigurationRow): (string | number)[] {
    return row.valuePath ?? row.path;
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
function createAddButton(row: TraceConfigurationRow): HTMLElement {
    const wrapper = createElement('span', 'add-button-wrapper tooltip-wrapper');
    const button = createElement('button', 'icon-button add-button');
    button.type = 'button';
    const disabledReason = row.addChildDisabledReason;
    const tooltip = disabledReason ?? row.addChildTooltip ?? 'Add Item';
    wrapper.dataset.tooltip = tooltip;
    button.disabled = Boolean(disabledReason);
    button.setAttribute('aria-label', tooltip);
    button.append(createIcon('add'));
    wrapper.addEventListener('click', event => {
        event.stopPropagation();
    });
    wrapper.addEventListener('keydown', event => {
        event.stopPropagation();
    });
    if (disabledReason) {
        wrapper.tabIndex = 0;
        wrapper.setAttribute('aria-label', disabledReason);
    } else {
        button.addEventListener('click', event => {
            event.stopPropagation();
            post({ type: 'addItem', path: row.path, addChildKind: row.addChildKind ?? 'generic-map' });
        });
    }
    wrapper.append(button);
    return wrapper;
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
        post({ type: 'updateValue', path: getValuePath(row), value: checkbox.checked });
    });
    label.append(checkbox);
    return label;
}

/**
 * createSelect renders scalar fields with known small vocabularies, such as
 * access and output. Changes are saved immediately through the host.
 */
function createSelect(row: TraceConfigurationRow): HTMLElement {
    const disabledReason = row.controlDisabledReason;
    const select = createElement('select');
    select.disabled = Boolean(disabledReason);
    select.setAttribute('aria-label', row.label);
    if (row.placeholder && !row.value) {
        const placeholderOption = createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = row.placeholder;
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        select.classList.add('placeholder-selected');
        select.append(placeholderOption);
    }
    (row.options ?? []).forEach(optionValue => {
        const option = createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        option.selected = optionValue === row.value;
        select.append(option);
    });
    select.addEventListener('change', () => {
        post({ type: 'updateValue', path: getValuePath(row), value: select.value });
    });
    if (disabledReason) {
        const wrapper = createElement('span', 'tooltip-wrapper control-tooltip-wrapper');
        wrapper.dataset.tooltip = disabledReason;
        wrapper.tabIndex = 0;
        wrapper.setAttribute('aria-label', disabledReason);
        wrapper.append(select);
        return wrapper;
    }
    return select;
}

/**
 * createMultiSelect renders a compact dropdown checklist for fields where the
 * ctrace schema accepts multiple choices. Unchanged option lists retain their
 * DOM across host updates, while checked values stay synchronized with the host.
 * Each checkbox change posts the full selected array for the YAML update.
 */
function createMultiSelect(row: TraceConfigurationRow): HTMLElement {
    const signature = JSON.stringify([row.options ?? [], getValuePath(row), row.label]);
    const existingDetails = Array.from(root?.querySelectorAll<HTMLDetailsElement>('details.multi-select') ?? [])
        .find(details => details.dataset.rowId === row.id);
    const existingControl = existingDetails ? multiSelectControls.get(existingDetails) : undefined;
    if (existingDetails && existingControl?.signature === signature) {
        existingControl.updateSelectedOptions(row.selectedOptions ?? []);
        return existingDetails;
    }
    const details = createElement('details', 'multi-select');
    details.dataset.rowId = row.id;
    details.open = openMultiSelectId === row.id;
    const summary = createElement('summary', 'multi-select-summary');
    summary.append(createElement('span', 'multi-select-label'), createIcon('chevron-down'));
    const selectedValues = new Set(row.selectedOptions ?? []);

    /**
     * updateSummary mirrors the selected checklist values into the collapsed
     * dropdown label so users can scan the current configuration without
     * opening each multi-select control.
     */
    const updateSummary = () => {
        const label = summary.querySelector('.multi-select-label') as HTMLElement;
        if (label) {
            label.textContent = selectedValues.size > 0
                ? Array.from(selectedValues).join(', ')
                : 'None';
        }
    };
    updateSummary();
    details.addEventListener('toggle', () => {
        if (details.open) {
            openMultiSelectId = row.id;
            document.querySelectorAll<HTMLDetailsElement>('details.multi-select[open]').forEach(openDetails => {
                if (openDetails !== details) {
                    openDetails.open = false;
                }
            });
            return;
        }
        openMultiSelectId = openMultiSelectId === row.id ? undefined : openMultiSelectId;
    });
    const menu = createElement('div', 'multi-select-menu');
    (row.options ?? []).forEach(optionValue => {
        const label = createElement('label', 'multi-select-option');
        const checkbox = createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = optionValue;
        checkbox.checked = selectedValues.has(optionValue);
        checkbox.setAttribute('aria-label', `${row.label} ${optionValue}`);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedValues.add(optionValue);
            } else {
                selectedValues.delete(optionValue);
            }
            updateSummary();
            post({ type: 'updateValue', path: getValuePath(row), value: Array.from(selectedValues) });
        });
        const text = createElement('span');
        text.textContent = optionValue;
        label.append(checkbox, text);
        menu.append(label);
    });
    multiSelectControls.set(details, {
        signature,
        updateSelectedOptions(selectedOptions): void {
            selectedValues.clear();
            selectedOptions.forEach(optionValue => selectedValues.add(optionValue));
            menu.querySelectorAll<HTMLInputElement>('input').forEach(checkbox => {
                checkbox.checked = selectedValues.has(checkbox.value);
            });
            updateSummary();
        }
    });
    details.append(summary, menu);
    return details;
}

/**
 * createTextInput renders editable scalar text. It commits on blur or Enter so
 * users can type without saving the file after every keystroke.
 */
function createTextInput(row: TraceConfigurationRow): HTMLElement {
    const disabledReason = row.controlDisabledReason;
    const input = createElement('input');
    input.type = 'text';
    input.value = row.value ?? '';
    input.placeholder = row.placeholder ?? '';
    input.disabled = Boolean(disabledReason);
    input.spellcheck = false;
    input.setAttribute('aria-label', row.label);
    let lastCommittedValue = input.value;
    const commit = () => {
        if (replacingContents || input.value === lastCommittedValue) {
            return;
        }
        lastCommittedValue = input.value;
        post({ type: 'updateValue', path: getValuePath(row), value: input.value });
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            commit();
            input.blur();
        }
    });
    if (disabledReason) {
        const wrapper = createElement('span', 'tooltip-wrapper control-tooltip-wrapper');
        wrapper.dataset.tooltip = disabledReason;
        wrapper.tabIndex = 0;
        wrapper.setAttribute('aria-label', disabledReason);
        wrapper.append(input);
        return wrapper;
    }
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
 * complete snapshots, so every trusted update simply re-renders the webview.
 */
function onMessage(event: MessageEvent<TraceHostToWebviewMessage>): void {
    if (event.origin !== window.location.origin) {
        return;
    }
    if (event.data.type === 'update') {
        renderApp(event.data.state);
    }
}

/** Tracks whether the current primary pointer gesture began in a control. */
let pointerStartedInControl = false;

document.addEventListener('pointerdown', event => {
    if (event.isPrimary) {
        pointerStartedInControl = isRowToggleInteractiveTarget(event.target);
    }
}, true);

document.addEventListener('pointercancel', () => {
    pointerStartedInControl = false;
});

window.addEventListener('blur', () => {
    pointerStartedInControl = false;
});

document.addEventListener('click', event => {
    pointerStartedInControl = false;
    if (event.target instanceof HTMLElement && event.target.closest('.multi-select')) {
        return;
    }
    closeOpenMultiSelect();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeOpenMultiSelect();
    }
});

window.addEventListener('message', onMessage);
post({ type: 'ready' });
