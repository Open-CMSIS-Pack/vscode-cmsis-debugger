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

import type {
    TraceConfigurationRow,
    TraceConfigurationState,
    TraceWebviewToHostMessage,
} from '../../../views/trace-configuration/trace-configuration-protocol';

jest.mock('./trace-configuration.css', () => ({}));

function loadWebview(globals: Record<string, unknown>): () => void {
    const originalDescriptors = Object.keys(globals).map(name => ({
        name,
        descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
    }));
    const restore = (): void => {
        originalDescriptors.forEach(({ name, descriptor }) => {
            if (descriptor) {
                Object.defineProperty(globalThis, name, descriptor);
            } else {
                Reflect.deleteProperty(globalThis, name);
            }
        });
    };
    try {
        Object.entries(globals).forEach(([name, value]) => {
            Object.defineProperty(globalThis, name, { configurable: true, value });
        });
        jest.isolateModules(() => { jest.requireActual<Record<string, unknown>>('./trace-configuration'); });
    } catch (error) {
        restore();
        throw error;
    }
    return restore;
}

class SplitterElement extends EventTarget {
    readonly attributes = new Map<string, string>();
    readonly dataset: Record<string, string> = {};
    readonly style = { setProperty: jest.fn() };
    readonly focus = jest.fn();
    tabIndex = -1;
    title = '';
    className = '';

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }
}

function createSplitterFixture(initialState?: unknown) {
    let savedState = initialState;
    const handle = new SplitterElement();
    const documentEvents = new EventTarget();
    const windowEvents = new EventTarget();
    const bodyClasses = new Set<string>();
    const scrollRegion = {
        clientWidth: 600,
        getBoundingClientRect: () => ({ left: 30 }),
    };
    const getScrollRegion = jest.fn(() => scrollRegion);
    const setState = jest.fn((state: { labelColumnWidth: number }) => { savedState = state; });
    const globals = {
        document: Object.assign(documentEvents, {
            getElementById: () => ({ querySelector: getScrollRegion }),
            createElement: () => handle,
            documentElement: { style: { setProperty: jest.fn() } },
            body: {
                classList: {
                    add: (name: string) => bodyClasses.add(name),
                    remove: (name: string) => bodyClasses.delete(name),
                }
            },
        }),
        window: windowEvents,
        ResizeObserver: jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() })),
        acquireVsCodeApi: () => ({ postMessage: jest.fn(), getState: () => savedState, setState }),
    };
    const restore = loadWebview(globals);
    return { handle, documentEvents, windowEvents, bodyClasses, getScrollRegion, setState, restore };
}

type SplitterFixture = ReturnType<typeof createSplitterFixture>;

function withSplitter(initialState: unknown, check: (fixture: SplitterFixture) => void): void {
    const fixture = createSplitterFixture(initialState);
    try {
        check(fixture);
    } finally {
        fixture.restore();
    }
}

function keyEvent(key: string, shiftKey = false): Event {
    return Object.assign(new Event('keydown', { cancelable: true }), { key, shiftKey });
}

function pointerEvent(type: string, clientX: number, pointerId = 1): Event {
    return Object.assign(new Event(type, { cancelable: true }), {
        clientX, pointerId, button: 0, isPrimary: true,
    });
}

function createRendererFixture() {
    const documentState: { activeElement: RendererElement | null } = { activeElement: null };

    // Only the DOM operations used by the renderer are needed in Jest's Node environment.
    class RendererElement extends SplitterElement {
        readonly children: RendererElement[] = [];
        readonly scrollIntoView = jest.fn();
        readonly focus = jest.fn((_options?: FocusOptions) => { documentState.activeElement = this; });
        readonly classList = {
            add: (name: string): void => { this.className += ` ${name}`; },
        };
        parentElement: RendererElement | null = null;
        disabled = false;
        textContent = '';
        scrollTop = 0;
        scrollLeft = 0;

        constructor(readonly tagName: string) {
            super();
        }

        get firstChild(): RendererElement | undefined {
            return this.children[0];
        }

        append(...children: RendererElement[]): void {
            children.forEach(child => {
                child.remove();
                child.parentElement = this;
                this.children.push(child);
            });
        }

        remove(): void {
            if (this.contains(documentState.activeElement)) {
                documentState.activeElement = null;
            }
            if (this.parentElement) {
                const siblings = this.parentElement.children;
                siblings.splice(siblings.indexOf(this), 1);
                this.parentElement = null;
            }
        }

        contains(element: RendererElement | null): boolean {
            return this === element || this.children.some(child => child.contains(element));
        }

        removeAttribute(name: string): void {
            this.attributes.delete(name);
        }

        matches(selector: string): boolean {
            if (selector.startsWith('.')) {
                return this.className.split(' ').includes(selector.slice(1));
            }
            if (selector === 'tr[data-row-id]') {
                return this.tagName === 'tr' && this.dataset.rowId !== undefined;
            }
            if (selector === 'input[type="text"]') {
                return this instanceof RendererInput && this.type === 'text';
            }
            if (selector === '[data-focus-key]') {
                return this.dataset.focusKey !== undefined;
            }
            if (selector === ':disabled') {
                return this.disabled;
            }
            if (selector === 'details.multi-select' || selector === 'details.multi-select[open]') {
                return this instanceof RendererDetails && (selector === 'details.multi-select' || this.open);
            }
            if (['input', 'select', 'button', 'summary', 'option'].includes(selector)) {
                return this.tagName === selector;
            }
            throw new Error(`Unsupported test selector: ${selector}`);
        }

        closest(selector: string): RendererElement | null {
            return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
        }

        querySelectorAll(selector: string): RendererElement[] {
            return this.children.flatMap(child => [
                ...(child.matches(selector) ? [child] : []),
                ...child.querySelectorAll(selector),
            ]);
        }

        querySelector(selector: string): RendererElement | undefined {
            return this.querySelectorAll(selector)[0];
        }
    }

    class RendererInput extends RendererElement {
        type = '';
        value = '';
        checked = false;
        selectionStart: number | null = 0;
        selectionEnd: number | null = 0;
        selectionDirection: 'forward' | 'backward' | 'none' | null = 'none';

        setSelectionRange(
            start: number | null,
            end: number | null,
            direction: 'forward' | 'backward' | 'none' = 'none'
        ): void {
            this.selectionStart = start;
            this.selectionEnd = end;
            this.selectionDirection = direction;
        }

        blur(): void {
            if (documentState.activeElement === this) {
                documentState.activeElement = null;
                this.dispatchEvent(new Event('blur'));
            }
        }
    }

    class RendererRow extends RendererElement { }
    class RendererDetails extends RendererElement { open = false; }
    class RendererOption extends RendererElement { value = ''; selected = false; }
    class RendererSelect extends RendererElement {
        get value(): string {
            return this.children.find((child): child is RendererOption => child instanceof RendererOption && child.selected)?.value ?? '';
        }
    }

    const root = new RendererElement('div');
    const windowEvents = Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } });
    const postMessage = jest.fn<void, [TraceWebviewToHostMessage]>();
    const documentEvents = Object.assign(new EventTarget(), {
        getElementById: () => root,
        createElement: (tagName: string) => {
            switch (tagName) {
                case 'input': return new RendererInput(tagName);
                case 'tr': return new RendererRow(tagName);
                case 'details': return new RendererDetails(tagName);
                case 'option': return new RendererOption(tagName);
                case 'select': return new RendererSelect(tagName);
                default: return new RendererElement(tagName);
            }
        },
        querySelectorAll: (selector: string) => root.querySelectorAll(selector),
        documentElement: { style: { setProperty: jest.fn() } },
    });
    Object.defineProperty(documentEvents, 'activeElement', { get: () => documentState.activeElement });
    const restore = loadWebview({
        document: documentEvents,
        window: windowEvents,
        HTMLElement: RendererElement,
        HTMLInputElement: RendererInput,
        HTMLTableRowElement: RendererRow,
        ResizeObserver: jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() })),
        acquireVsCodeApi: () => ({ postMessage, getState: () => undefined }),
    });
    const render = (state: TraceConfigurationState): void => {
        windowEvents.dispatchEvent(new MessageEvent('message', {
            origin: windowEvents.location.origin,
            data: { type: 'update', state },
        }));
    };
    const getElement = (selector: string): RendererElement => {
        const element = root.querySelector(selector);
        if (!element) {
            throw new Error(`Expected a rendered element matching ${selector}`);
        }
        return element;
    };
    const getInput = (selector = 'input[type="text"]'): RendererInput => {
        const input = getElement(selector);
        if (!(input instanceof RendererInput)) {
            throw new Error('Expected a rendered text input');
        }
        return input;
    };
    const getDropdown = (rowId?: string): RendererDetails => {
        const dropdown = root.querySelectorAll('details.multi-select')
            .find(element => rowId === undefined || element.dataset.rowId === rowId);
        if (!(dropdown instanceof RendererDetails)) {
            throw new Error('Expected a rendered dropdown');
        }
        return dropdown;
    };
    const getOption = (value: string): RendererInput => {
        const input = root.querySelectorAll('input')
            .find((element): element is RendererInput => element instanceof RendererInput && element.value === value);
        if (!input) {
            throw new Error(`Expected a rendered option with value ${value}`);
        }
        return input;
    };
    const getSelect = (): RendererSelect => {
        const select = getElement('select');
        if (!(select instanceof RendererSelect)) {
            throw new Error('Expected a rendered select');
        }
        return select;
    };
    const outside = new RendererElement('button');
    return {
        root, render, getElement, getInput, getDropdown, getOption, getSelect, documentEvents, outside,
        getActiveElement: () => documentState.activeElement, postMessage, restore,
    };
}

function withRenderer(check: (fixture: ReturnType<typeof createRendererFixture>) => void): void {
    const fixture = createRendererFixture();
    try {
        check(fixture);
    } finally {
        fixture.restore();
    }
}

function createTraceState(
    state: Partial<TraceConfigurationState> = {},
    row: Partial<TraceConfigurationRow> = {}
): TraceConfigurationState {
    return {
        fileName: '/workspace/target.ctrace.yml',
        loading: false,
        dirty: true,
        validationState: 'pending',
        rows: [{
            id: 'location["0"]',
            label: 'Location',
            path: ['data', 0, 'location'],
            depth: 0,
            kind: 'scalar',
            control: 'text',
            value: '',
            hasChildren: false,
            expanded: false,
            removable: false,
            ...row,
        }],
        ...state,
    };
}

describe('Trace Generation text input refresh', () => {
    it('retains focus on an empty location while validation and row diagnostics update', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage, root }) => {
            render(createTraceState());
            getInput().focus();
            for (const validationState of ['running', 'failed', 'passed'] as const) {
                render(createTraceState({ validationState }, {
                    validation: { severity: 'error', message: 'Empty location' },
                }));
                expect(getActiveElement()).toBe(getInput());
                expect(getInput().value).toBe('');
                expect(getInput().focus).toHaveBeenCalledWith({ preventScroll: true });
                expect(root.querySelector('.validation-error')).toBeDefined();
            }
            getInput().blur();
            expect(postMessage.mock.calls.map(([message]) => message)).toEqual([{ type: 'ready' }]);
        });
    });

    it.each(['blur', 'Enter'])('retains a draft and selection, then commits once on %s', action => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            const input = getInput();
            input.focus();
            input.value = 'my_variable';
            input.setSelectionRange(2, 6, 'backward');
            render(createTraceState({ validationState: 'failed' }));
            render(createTraceState({ validationState: 'running' }));

            const replacement = getInput();
            expect(getActiveElement()).toBe(replacement);
            expect(replacement.value).toBe('my_variable');
            expect([replacement.selectionStart, replacement.selectionEnd, replacement.selectionDirection])
                .toEqual([2, 6, 'backward']);
            expect(postMessage).toHaveBeenCalledTimes(1);
            if (action === 'Enter') {
                replacement.dispatchEvent(keyEvent('Enter'));
            } else {
                replacement.blur();
            }
            replacement.dispatchEvent(new Event('change'));
            expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
                { type: 'ready' },
                { type: 'updateValue', path: ['data', 0, 'location'], value: 'my_variable' },
            ]);
        });
    });

    it('gives an explicit host row focus request precedence', () => {
        withRenderer(({ render, getInput, getActiveElement }) => {
            const state = createTraceState();
            render(state);
            getInput().focus();
            render({ ...state, focusedRowId: state.rows[0].id });
            expect(getActiveElement()?.dataset.rowId).toBe(state.rows[0].id);
            expect(getInput().focus).not.toHaveBeenCalled();
        });
    });

    it.each<{
        name: string;
        state?: Partial<TraceConfigurationState>;
        row?: Partial<TraceConfigurationRow>;
    }>([
        { name: 'the file changes', state: { fileName: '/workspace/other.ctrace.yml' } },
        { name: 'the field is removed', state: { rows: [] } },
        { name: 'the field becomes disabled', row: { controlDisabledReason: 'Unavailable' } },
        { name: 'the control changes', row: { control: 'readonly' } },
        { name: 'the value path changes', row: { valuePath: ['data', 1, 'location'] } },
        { name: 'the host value changes', row: { value: 'host_value' } },
    ])('does not restore a stale edit when $name', ({ state, row }) => {
        withRenderer(({ render, getInput, getActiveElement, root }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'draft';
            render(createTraceState(state, row));
            expect(getActiveElement()).toBeNull();
            if (root.querySelector('input[type="text"]')) {
                expect(getInput().value).toBe(row?.value ?? '');
                expect(getInput().focus).not.toHaveBeenCalled();
            }
        });
    });

    it('preserves existing row focus and table scroll positions', () => {
        withRenderer(({ render, getActiveElement, root }) => {
            const state = createTraceState();
            render(state);
            root.querySelector('tr[data-row-id]')?.focus();
            const scrollRegion = root.querySelector('.option-tree-scroll');
            if (!scrollRegion) {
                throw new Error('Expected the table scroll region');
            }
            scrollRegion.scrollTop = 120;
            scrollRegion.scrollLeft = 40;
            render({ ...state, validationState: 'running' });
            expect(getActiveElement()?.dataset.rowId).toBe(state.rows[0].id);
            expect(root.querySelector('.option-tree-scroll')?.scrollTop).toBe(120);
            expect(root.querySelector('.option-tree-scroll')?.scrollLeft).toBe(40);
        });
    });
});

describe('Trace Generation interaction refresh', () => {
    it.each<{ name: string; selector: string; row: Partial<TraceConfigurationRow> }>([
        { name: 'checkbox', selector: 'input', row: { control: 'checkbox' } },
        { name: 'select', selector: 'select', row: { control: 'select', options: ['read', 'write'], value: 'read' } },
        { name: 'remove action', selector: '.node-action', row: { removable: true } },
        { name: 'add action', selector: '.add-button', row: { addChildKind: 'data' } },
        { name: 'disabled add tooltip', selector: '.add-button-wrapper', row: { addChildKind: 'data', addChildDisabledReason: 'Full' } },
        { name: 'disabled text tooltip', selector: '.control-tooltip-wrapper', row: { controlDisabledReason: 'Unavailable' } },
        { name: 'disabled select tooltip', selector: '.control-tooltip-wrapper', row: { control: 'select', controlDisabledReason: 'Unavailable' } },
        { name: 'dropdown summary', selector: 'summary', row: { control: 'multi-select', options: ['read', 'write'] } },
        { name: 'dropdown option', selector: 'input', row: { control: 'multi-select', options: ['read', 'write'] } },
        { name: 'row', selector: 'tr[data-row-id]', row: { hasChildren: true } },
        { name: 'divider', selector: '.column-resize-handle', row: {} },
        { name: 'file button', selector: '.trace-file', row: {} },
    ])('retains $name focus when validation markers appear', ({ selector, row }) => {
        withRenderer(({ render, getElement, getActiveElement, root }) => {
            render(createTraceState({}, row));
            const dropdown = root.querySelector('details.multi-select');
            if (dropdown) {
                // The real browser permits option focus only while the dropdown is open.
                Object.assign(dropdown, { open: true });
            }
            getElement(selector).focus();
            render(createTraceState({ validationState: 'failed' }, {
                ...row, validation: { severity: 'error', message: 'Invalid configuration' },
            }));
            expect(getActiveElement()).toBe(getElement(selector));
            expect(getElement(selector).focus).toHaveBeenLastCalledWith({ preventScroll: true });
        });
    });

    it('retains validation tooltip focus when its severity changes', () => {
        withRenderer(({ render, getElement, getActiveElement }) => {
            render(createTraceState({}, { validation: { severity: 'warning', message: 'Warning' } }));
            getElement('.validation-icon').focus();
            render(createTraceState({}, { validation: { severity: 'error', message: 'Error' } }));
            expect(getActiveElement()).toBe(getElement('.validation-error'));
        });
    });

    it.each<{ name: string; selector: string; before: Partial<TraceConfigurationRow>; after: Partial<TraceConfigurationRow> }>([
        { name: 'a select becomes disabled', selector: 'select', before: { control: 'select' }, after: { controlDisabledReason: 'Unavailable' } },
        { name: 'an add action becomes disabled', selector: '.add-button', before: { addChildKind: 'data' }, after: { addChildDisabledReason: 'Full' } },
        { name: 'a remove action disappears', selector: '.node-action', before: { removable: true }, after: { removable: false } },
        { name: 'a validation marker disappears', selector: '.validation-icon', before: { validation: { severity: 'error', message: 'Error' } }, after: { validation: undefined } },
        { name: 'a checkbox changes control type', selector: 'input', before: { control: 'checkbox' }, after: { control: 'text' } },
        { name: 'a checkbox changes value path', selector: 'input', before: { control: 'checkbox' }, after: { valuePath: ['other'] } },
        { name: 'a dropdown option disappears', selector: 'input', before: { control: 'multi-select', options: ['read', 'write'] }, after: { options: ['write'] } },
    ])('does not restore focus when $name', ({ selector, before, after }) => {
        withRenderer(({ render, getElement, getActiveElement }) => {
            render(createTraceState({}, before));
            getElement(selector).focus();
            render(createTraceState({}, { ...before, ...after }));
            expect(getActiveElement()).toBeNull();
        });
    });

    it('keeps host checkbox values authoritative while retaining focus', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState({}, { control: 'checkbox', checked: false }));
            getInput('input').focus();
            render(createTraceState({}, { control: 'checkbox', checked: true }));
            expect(getActiveElement()).toBe(getInput('input'));
            expect(getInput('input').checked).toBe(true);
            expect(postMessage).toHaveBeenCalledTimes(1);
        });
    });

    it('keeps host select values authoritative while retaining focus', () => {
        withRenderer(({ render, getSelect, getActiveElement, postMessage }) => {
            const row: Partial<TraceConfigurationRow> = { control: 'select', options: ['read', 'write'] };
            render(createTraceState({}, { ...row, value: 'read' }));
            getSelect().focus();
            render(createTraceState({}, { ...row, value: 'write' }));
            expect(getActiveElement()).toBe(getSelect());
            expect(getSelect().value).toBe('write');
            expect(postMessage).toHaveBeenCalledTimes(1);
        });
    });

    it.each([false, true])('preserves dropdown interaction and host values when recreated: %s', recreate => {
        withRenderer(({ render, getDropdown, getElement, getOption, getActiveElement, postMessage }) => {
            const optionValue = 'read["0"]';
            const row: Partial<TraceConfigurationRow> = {
                control: 'multi-select', options: [optionValue, 'write'], selectedOptions: [optionValue],
            };
            render(createTraceState({}, row));
            const original = getDropdown();
            original.open = true;
            Object.assign(getElement('.multi-select-menu'), { scrollTop: 70, scrollLeft: 12 });
            Object.assign(getElement('.option-tree-scroll'), { scrollTop: 150, scrollLeft: 35 });
            getOption(optionValue).focus();
            render(createTraceState({ validationState: 'running' }, {
                ...row, options: recreate ? ['write', optionValue, 'execute'] : row.options, selectedOptions: ['write'],
            }));
            expect(getDropdown() === original).toBe(!recreate);
            expect(getDropdown().open).toBe(true);
            expect(getElement('.multi-select-menu').scrollTop).toBe(70);
            expect(getElement('.multi-select-menu').scrollLeft).toBe(12);
            expect(getElement('.option-tree-scroll').scrollTop).toBe(150);
            expect(getElement('.option-tree-scroll').scrollLeft).toBe(35);
            expect(getActiveElement()).toBe(getOption(optionValue));
            expect(getOption(optionValue).checked).toBe(false);
            expect(getOption('write').checked).toBe(true);
            expect(postMessage).toHaveBeenCalledTimes(1);

            getOption(optionValue).checked = true;
            getOption(optionValue).dispatchEvent(new Event('change'));
            expect(postMessage).toHaveBeenLastCalledWith({
                type: 'updateValue', path: ['data', 0, 'location'], value: ['write', optionValue],
            });
            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it('restores dropdown state and scroll when an explicit host request focuses its row', () => {
        withRenderer(({ render, getDropdown, getElement, getActiveElement }) => {
            const state = createTraceState({}, { control: 'multi-select', options: ['read', 'write'] });
            render(state);
            getDropdown().open = true;
            getElement('summary').focus();
            getElement('.multi-select-menu').scrollTop = 50;
            getElement('.option-tree-scroll').scrollTop = 150;
            render({ ...state, focusedRowId: state.rows[0].id });
            const row = getElement('tr[data-row-id]');
            expect(getActiveElement()).toBe(row);
            expect(getDropdown().open).toBe(true);
            expect(getElement('.multi-select-menu').scrollTop).toBe(50);
            expect(getElement('.option-tree-scroll').scrollTop).toBe(150);
            expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
            expect(row.scrollIntoView.mock.invocationCallOrder[0]).toBeLessThan(row.focus.mock.invocationCallOrder[0]);
        });
    });

    it('does not fall back to previous focus if an explicit host target is missing', () => {
        withRenderer(({ render, getInput, getActiveElement }) => {
            render(createTraceState());
            getInput().focus();
            render(createTraceState({ focusedRowId: 'missing' }));
            expect(getActiveElement()).toBeNull();
        });
    });

    it.each(['summary', 'input', '.column-resize-handle', '.trace-file'])(
        'starts with fresh interaction state on a file change while %s is focused', selector => {
            withRenderer(({ render, getElement, getDropdown, getActiveElement }) => {
                const row: Partial<TraceConfigurationRow> = { control: 'multi-select', options: ['read', 'write'] };
                render(createTraceState({}, row));
                const original = getDropdown();
                original.open = true;
                getElement('.multi-select-menu').scrollTop = 70;
                Object.assign(getElement('.option-tree-scroll'), { scrollTop: 150, scrollLeft: 35 });
                getElement(selector).focus();
                render(createTraceState({ fileName: '/workspace/other.ctrace.yml' }, row));
                expect(getDropdown()).not.toBe(original);
                expect(getDropdown().open).toBe(false);
                expect(getElement('.multi-select-menu').scrollTop).toBe(0);
                expect(getElement('.option-tree-scroll').scrollTop).toBe(0);
                expect(getElement('.option-tree-scroll').scrollLeft).toBe(0);
                expect(getActiveElement()).toBeNull();
            });
        }
    );

    it('honors explicit row focus on a file change', () => {
        withRenderer(({ render, getInput, getElement, getActiveElement }) => {
            const state = createTraceState();
            render(state);
            getInput().focus();
            getInput().value = 'draft';
            render({ ...state, fileName: '/workspace/other.ctrace.yml', focusedRowId: state.rows[0].id });
            expect(getActiveElement()).toBe(getElement('tr[data-row-id]'));
            expect(getInput().value).toBe('');
        });
    });

    it('leaves focus outside the view undisturbed', () => {
        withRenderer(({ render, outside, getActiveElement }) => {
            render(createTraceState());
            outside.focus();
            render(createTraceState({ validationState: 'running' }));
            expect(getActiveElement()).toBe(outside);
            expect(outside.focus).toHaveBeenCalledTimes(1);
        });
    });

    it.each(['outside click', 'Escape'])('keeps dropdowns closed after %s and a refresh', action => {
        withRenderer(({ render, getDropdown, documentEvents }) => {
            const state = createTraceState({}, { control: 'multi-select', options: ['read', 'write'] });
            render(state);
            getDropdown().open = true;
            documentEvents.dispatchEvent(action === 'Escape' ? keyEvent('Escape') : new Event('click'));
            expect(getDropdown().open).toBe(false);
            render(state);
            expect(getDropdown().open).toBe(false);
        });
    });

    it('does not close a dropdown for clicks inside it', () => {
        withRenderer(({ render, getDropdown, getElement, documentEvents }) => {
            render(createTraceState({}, { control: 'multi-select', options: ['read', 'write'] }));
            getDropdown().open = true;
            const event = new Event('click');
            Object.defineProperty(event, 'target', { value: getElement('summary') });
            documentEvents.dispatchEvent(event);
            expect(getDropdown().open).toBe(true);
        });
    });

    it('closes sibling dropdowns when a dropdown opens', () => {
        withRenderer(({ render, getDropdown }) => {
            const state = createTraceState({}, { control: 'multi-select', options: ['read', 'write'] });
            render({ ...state, rows: [state.rows[0], { ...state.rows[0], id: 'second', path: ['other'] }] });
            const first = getDropdown(state.rows[0].id);
            first.open = true;
            first.dispatchEvent(new Event('toggle'));
            const second = getDropdown('second');
            second.open = true;
            second.dispatchEvent(new Event('toggle'));
            expect(first.open).toBe(false);
            expect(second.open).toBe(true);
        });
    });

    it('ignores toggle events from detached dropdowns', () => {
        withRenderer(({ render, getDropdown }) => {
            render(createTraceState({}, { control: 'multi-select', options: ['read', 'write'] }));
            const original = getDropdown();
            original.open = true;
            render(createTraceState({}, { control: 'multi-select', options: ['write', 'read'] }));
            expect(getDropdown()).not.toBe(original);
            original.dispatchEvent(new Event('toggle'));
            expect(getDropdown().open).toBe(true);
            original.open = false;
            original.dispatchEvent(new Event('toggle'));
            expect(getDropdown().open).toBe(true);
        });
    });
});

describe('Trace Generation column splitter', () => {
    it('restores the saved width without overwriting other webview state', () => {
        withSplitter({ labelColumnWidth: 60, retained: true }, ({ handle, setState }) => {
            handle.dispatchEvent(keyEvent('ArrowRight'));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 61, retained: true });
            expect(handle.attributes.get('aria-valuenow')).toBe('61');
        });
    });

    it.each([undefined, { labelColumnWidth: '60' }, { labelColumnWidth: NaN }])(
        'uses the default width for missing or invalid saved state: %p', initialState => {
            withSplitter(initialState, ({ handle, setState }) => {
                handle.dispatchEvent(keyEvent('ArrowRight'));
                expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 53 });
            });
        }
    );

    it('clamps keyboard resizing and supports large steps and reset', () => {
        withSplitter({ labelColumnWidth: 200 }, ({ handle, setState }) => {
            handle.dispatchEvent(keyEvent('ArrowRight'));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 85 });
            handle.dispatchEvent(keyEvent('Home'));
            handle.dispatchEvent(keyEvent('ArrowLeft'));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 15 });
            handle.dispatchEvent(keyEvent('ArrowRight', true));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 25 });
            handle.dispatchEvent(keyEvent('End'));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 85 });
            handle.dispatchEvent(keyEvent('Enter'));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 52 });
            handle.dispatchEvent(keyEvent('ArrowLeft'));
            handle.dispatchEvent(new Event('dblclick'));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 52 });
        });
    });

    it('keeps dragging against the current scroll region after a redraw and removes listeners on release', () => {
        withSplitter(undefined, ({ handle, documentEvents, bodyClasses, getScrollRegion, setState }) => {
            handle.dispatchEvent(pointerEvent('pointerdown', 344));
            expect(bodyClasses.has('resizing')).toBe(true);
            getScrollRegion.mockReturnValue({ clientWidth: 500, getBoundingClientRect: () => ({ left: 40 }) });
            documentEvents.dispatchEvent(pointerEvent('pointermove', 342, 2));
            expect(setState).not.toHaveBeenCalled();
            documentEvents.dispatchEvent(pointerEvent('pointermove', 342));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 60 });
            documentEvents.dispatchEvent(pointerEvent('pointermove', 1000));
            expect(setState).toHaveBeenLastCalledWith({ labelColumnWidth: 85 });
            documentEvents.dispatchEvent(pointerEvent('pointerup', 1000));
            expect(bodyClasses.has('resizing')).toBe(false);
            setState.mockClear();
            documentEvents.dispatchEvent(pointerEvent('pointermove', 0));
            expect(setState).not.toHaveBeenCalled();
        });
    });

    it.each(['pointercancel', 'blur'])('cleans up an interrupted drag on %s', eventType => {
        withSplitter(undefined, ({ handle, documentEvents, windowEvents, bodyClasses, setState }) => {
            handle.dispatchEvent(pointerEvent('pointerdown', 342));
            if (eventType === 'blur') {
                windowEvents.dispatchEvent(new Event('blur'));
            } else {
                documentEvents.dispatchEvent(pointerEvent(eventType, 342));
            }
            expect(bodyClasses.has('resizing')).toBe(false);
            documentEvents.dispatchEvent(pointerEvent('pointermove', 400));
            expect(setState).not.toHaveBeenCalled();
        });
    });
});
