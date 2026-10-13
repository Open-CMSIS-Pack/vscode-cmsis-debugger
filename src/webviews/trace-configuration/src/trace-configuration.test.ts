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

jest.mock('./trace-configuration.css', () => ({}));

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
