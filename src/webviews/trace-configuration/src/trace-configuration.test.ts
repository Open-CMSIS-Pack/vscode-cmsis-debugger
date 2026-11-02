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
        readonly dataset: Record<string, string> = {};
        readonly scrollIntoView = jest.fn();
        readonly focus = jest.fn((_options?: FocusOptions) => { documentState.activeElement = this; });
        parentElement: RendererElement | null = null;
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
            const activeElement = documentState.activeElement;
            if (this.contains(activeElement)) {
                documentState.activeElement = null;
                activeElement?.dispatchEvent(new Event('blur'));
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
            if (selector.includes(', ')) {
                return selector.split(', ').some(part => this.matches(part));
            }
            if (selector.startsWith('.')) {
                return this.className.split(' ').includes(selector.slice(1));
            }
            if (selector === 'details.multi-select[open]') {
                return false;
            }
            if (selector === 'tr[data-row-id]') {
                return this.tagName === 'tr' && this.dataset.rowId !== undefined;
            }
            if (selector === 'input[type="text"]') {
                return this instanceof RendererInput && this.type === 'text';
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
        disabled = false;
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
    class RendererButton extends RendererElement { }
    class RendererSelect extends RendererElement { }

    const root = new RendererElement('div');
    const windowEvents = Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } });
    const postMessage = jest.fn<void, [TraceWebviewToHostMessage]>();
    const documentEvents = Object.assign(new EventTarget(), {
        getElementById: () => root,
        createElement: (tagName: string) => {
            switch (tagName) {
                case 'input':
                    return new RendererInput(tagName);
                case 'tr':
                    return new RendererRow(tagName);
                case 'button':
                    return new RendererButton(tagName);
                case 'select':
                    return new RendererSelect(tagName);
                default:
                    return new RendererElement(tagName);
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
        HTMLButtonElement: RendererButton,
        HTMLSelectElement: RendererSelect,
        ResizeObserver: jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() })),
        acquireVsCodeApi: () => ({ postMessage, getState: () => undefined }),
    });
    const render = (state: TraceConfigurationState, completedEditId?: number): void => {
        windowEvents.dispatchEvent(new MessageEvent('message', {
            origin: windowEvents.location.origin,
            data: { type: 'update', state, ...(completedEditId !== undefined ? { completedEditId } : {}) },
        }));
    };
    const getInput = (index = 0): RendererInput => {
        const input = root.querySelectorAll('input[type="text"]').at(index);
        if (!(input instanceof RendererInput)) {
            throw new Error('Expected a rendered text input');
        }
        return input;
    };
    return { root, render, getInput, documentEvents, windowEvents, getActiveElement: () => documentState.activeElement, postMessage, restore };
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

/** Covers host changes that invalidate the identity or availability of an active input. */
const TEXT_INPUT_IDENTITY_CHANGES: readonly {
    name: string;
    state?: Partial<TraceConfigurationState>;
    row?: Partial<TraceConfigurationRow>;
}[] = [
    { name: 'the file changes', state: { fileName: '/workspace/other.ctrace.yml' } },
    { name: 'the field is removed', state: { rows: [] } },
    { name: 'the field becomes disabled', row: { controlDisabledReason: 'Unavailable' } },
    { name: 'the control changes', row: { control: 'readonly' } },
    { name: 'the value path changes', row: { valuePath: ['data', 1, 'location'] } },
];

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
            render(createTraceState({ validationState: 'running' }, { value: 'my_variable' }));
            expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
                { type: 'ready' },
                { type: 'updateValue', path: ['data', 0, 'location'], value: 'my_variable', editId: 1 },
            ]);
        });
    });

    it.each([
        { submittedValue: 'my_variable', hostValue: 'my_variable' },
        { submittedValue: '0016', hostValue: '16' },
    ])('commits $submittedValue and retains focus and selection through host completion', ({ submittedValue, hostValue }) => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            const input = getInput();
            input.focus();
            input.value = submittedValue;
            input.setSelectionRange(1, 3, 'backward');
            const enter = keyEvent('Enter');

            input.dispatchEvent(enter);

            expect(enter.defaultPrevented).toBe(true);
            expect(getActiveElement()).toBe(input);
            expect(postMessage).toHaveBeenLastCalledWith({
                type: 'updateValue', path: ['data', 0, 'location'], value: submittedValue, editId: 1,
            });

            render(createTraceState({ validationState: 'running' }, { value: hostValue }));
            render(createTraceState({ validationState: 'running' }, { value: hostValue }), 1);
            render(createTraceState({ validationState: 'passed' }, { value: hostValue }));

            const replacement = getInput();
            expect(getActiveElement()).toBe(replacement);
            expect(replacement.value).toBe(submittedValue);
            expect([replacement.selectionStart, replacement.selectionEnd, replacement.selectionDirection])
                .toEqual([1, 3, 'backward']);

            replacement.dispatchEvent(keyEvent('Enter'));
            replacement.dispatchEvent(new Event('change'));
            replacement.blur();
            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it.each(['my_variable', '16'])('retains further typing while the host applies %s', hostValue => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            const input = getInput();
            input.focus();
            input.value = hostValue === '16' ? '0016' : hostValue;
            input.dispatchEvent(keyEvent('Enter'));
            input.value = 'corrected_variable';
            input.setSelectionRange(3, 3);

            render(createTraceState({ validationState: 'running' }));
            render(createTraceState({ validationState: 'running' }, { value: hostValue }));
            render(createTraceState({ validationState: 'running' }, { value: hostValue }), 1);
            render(createTraceState({ validationState: 'passed' }, { value: hostValue }));

            expect(getActiveElement()).toBe(getInput());
            expect(getInput().value).toBe('corrected_variable');
            expect([getInput().selectionStart, getInput().selectionEnd]).toEqual([3, 3]);
            expect(postMessage).toHaveBeenCalledTimes(2);

            getInput().dispatchEvent(keyEvent('Enter'));
            expect(postMessage).toHaveBeenLastCalledWith({
                type: 'updateValue', path: ['data', 0, 'location'], value: 'corrected_variable', editId: 2,
            });
        });
    });

    it('does not resend a submitted value after a validation refresh before host completion', () => {
        withRenderer(({ render, getInput, postMessage }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'my_variable';
            getInput().dispatchEvent(keyEvent('Enter'));

            render(createTraceState({ validationState: 'running' }));
            getInput().dispatchEvent(keyEvent('Enter'));
            getInput().blur();

            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it('retains the newest edit across completion of multiple submitted corrections', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'first';
            getInput().dispatchEvent(keyEvent('Enter'));
            getInput().value = 'second';
            getInput().dispatchEvent(keyEvent('Enter'));
            getInput().value = 'third';
            getInput().setSelectionRange(2, 2);

            render(createTraceState({}, { value: 'first' }), 1);
            render(createTraceState({}, { value: 'second' }), 2);

            expect(getActiveElement()).toBe(getInput());
            expect(getInput().value).toBe('third');
            expect(getInput().selectionStart).toBe(2);
            getInput().blur();

            expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
                { type: 'ready' },
                { type: 'updateValue', path: ['data', 0, 'location'], value: 'first', editId: 1 },
                { type: 'updateValue', path: ['data', 0, 'location'], value: 'second', editId: 2 },
                { type: 'updateValue', path: ['data', 0, 'location'], value: 'third', editId: 3 },
            ]);
        });
    });

    it('keeps focus on Enter without changes and leaves other editing keys to the browser', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            getInput().focus();

            for (const key of ['Enter', 'ArrowLeft', 'ArrowRight', 'Tab']) {
                const event = keyEvent(key);
                getInput().dispatchEvent(event);
                expect(event.defaultPrevented).toBe(key === 'Enter');
                expect(getActiveElement()).toBe(getInput());
            }

            expect(postMessage).toHaveBeenCalledTimes(1);
        });
    });

    it('leaves Enter during input composition to the browser', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'composing';
            const event = Object.assign(keyEvent('Enter'), { isComposing: true });
            getInput().dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
            expect(getActiveElement()).toBe(getInput());
            expect(postMessage).toHaveBeenCalledTimes(1);
        });
    });

    it('does not restore input focus after the user leaves a submitted field', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'my_variable';
            getInput().dispatchEvent(keyEvent('Enter'));
            getInput().blur();

            render(createTraceState({}, { value: 'my_variable' }), 1);

            expect(getActiveElement()).toBeNull();
            expect(getInput().focus).not.toHaveBeenCalled();
            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it('honors a later authoritative value once the submitted edit has completed', () => {
        withRenderer(({ render, getInput, getActiveElement }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'my_variable';
            getInput().dispatchEvent(keyEvent('Enter'));
            render(createTraceState({}, { value: 'my_variable' }), 1);
            getInput().value = 'unfinished';

            render(createTraceState({}, { value: 'external_value' }));

            expect(getActiveElement()).toBeNull();
            expect(getInput().value).toBe('external_value');
        });
    });

    it('keeps focus in another input when a submitted edit finishes', () => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            const state = createTraceState();
            const otherRow = { ...state.rows[0], id: 'other', path: ['other'] };
            render({ ...state, rows: [...state.rows, otherRow] });
            getInput().focus();
            getInput().value = 'my_variable';
            getInput().dispatchEvent(keyEvent('Enter'));
            getInput().blur();
            getInput(1).focus();

            render({ ...state, rows: [{ ...state.rows[0], value: 'my_variable' }, otherRow] }, 1);

            expect(getActiveElement()).toBe(getInput(1));
            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it.each(TEXT_INPUT_IDENTITY_CHANGES)('does not restore a submitted edit when $name', ({ state, row }) => {
        withRenderer(({ render, getInput, getActiveElement, postMessage }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'my_variable';
            getInput().dispatchEvent(keyEvent('Enter'));

            render(createTraceState(state, row), 1);

            expect(getActiveElement()).toBeNull();
            expect(postMessage).toHaveBeenCalledTimes(2);
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

    it.each([
        ...TEXT_INPUT_IDENTITY_CHANGES,
        { name: 'the host value changes', row: { value: 'host_value' } },
    ])('does not restore a stale edit when $name', ({ state, row }) => {
        withRenderer(({ render, getInput, getActiveElement, root, postMessage }) => {
            render(createTraceState());
            getInput().focus();
            getInput().value = 'draft';
            render(createTraceState(state, row));
            expect(getActiveElement()).toBeNull();
            expect(postMessage).toHaveBeenCalledTimes(1);
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

/** Creates a DOM event with the target supplied by a bubbling browser gesture. */
function targetedEvent(type: string, target: EventTarget, properties: Record<string, unknown> = {}): Event {
    const event = Object.assign(new Event(type), properties);
    Object.defineProperty(event, 'target', { value: target });
    return event;
}

describe('Trace Generation row pointer gestures', () => {
    it.each(['row', 'label'])('does not toggle when a text selection ends over the %s', targetKind => {
        withRenderer(({ render, root, getInput, documentEvents, postMessage }) => {
            render(createTraceState({}, { hasChildren: true }));
            const row = root.querySelector('tr[data-row-id]');
            const label = root.querySelector('.node-prefix');
            if (!row || !label) {
                throw new Error('Expected an expandable row');
            }
            documentEvents.dispatchEvent(targetedEvent('pointerdown', getInput(), { isPrimary: true }));
            documentEvents.dispatchEvent(targetedEvent('pointerup', label, { isPrimary: true }));
            row.dispatchEvent(targetedEvent('click', targetKind === 'row' ? row : label, { detail: 1 }));
            expect(postMessage).toHaveBeenCalledTimes(1);

            documentEvents.dispatchEvent(targetedEvent('click', row, { detail: 1 }));
            documentEvents.dispatchEvent(targetedEvent('pointerdown', label, { isPrimary: true }));
            row.dispatchEvent(targetedEvent('click', label, { detail: 1 }));
            expect(postMessage).toHaveBeenLastCalledWith({ type: 'toggle', id: 'location["0"]', expanded: true });
            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it.each(['pointercancel', 'blur', 'next pointerdown'])('clears an interrupted selection on %s', action => {
        withRenderer(({ render, root, getInput, documentEvents, windowEvents, postMessage }) => {
            render(createTraceState({}, { hasChildren: true }));
            const row = root.querySelector('tr[data-row-id]');
            if (!row) {
                throw new Error('Expected an expandable row');
            }
            documentEvents.dispatchEvent(targetedEvent('pointerdown', getInput(), { isPrimary: true }));
            if (action === 'blur') {
                windowEvents.dispatchEvent(new Event('blur'));
            } else if (action === 'pointercancel') {
                documentEvents.dispatchEvent(new Event('pointercancel'));
            } else {
                documentEvents.dispatchEvent(targetedEvent('pointerdown', row, { isPrimary: true }));
            }
            row.dispatchEvent(targetedEvent('click', row, { detail: 1 }));
            expect(postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it('preserves keyboard toggles and clicks on controls', () => {
        withRenderer(({ render, root, getInput, documentEvents, postMessage }) => {
            render(createTraceState({}, { hasChildren: true }));
            const row = root.querySelector('tr[data-row-id]');
            if (!row) {
                throw new Error('Expected an expandable row');
            }
            documentEvents.dispatchEvent(targetedEvent('pointerdown', getInput(), { isPrimary: true }));
            row.dispatchEvent(targetedEvent('click', getInput(), { detail: 1 }));
            row.dispatchEvent(targetedEvent('keydown', getInput(), { key: 'Enter' }));
            expect(postMessage).toHaveBeenCalledTimes(1);
            row.dispatchEvent(targetedEvent('keydown', row, { key: 'Enter' }));
            row.dispatchEvent(targetedEvent('keydown', row, { key: ' ' }));
            row.dispatchEvent(targetedEvent('click', row, { detail: 0 }));
            expect(postMessage).toHaveBeenCalledTimes(4);
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
