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

/**
 * Unit tests for ComponentViewerWebviewProvider.
 */

import type { ScvdGuiInterface } from '../../model/scvd-gui-interface';
import type { HostToWebviewMessage, FlatRow } from '../../tree-view/tree-table-protocol';

const mockFire = jest.fn();

jest.mock('vscode', () => {
    class EventEmitter {
        public fire = mockFire;
        public event = jest.fn();
    }
    class TreeItem {
        public label: string;
        public collapsibleState: number | undefined;
        public description: string | undefined;
        public id: string | undefined;
        public contextValue: string | undefined;

        constructor(label: string) {
            this.label = label;
        }
    }
    class ThemeIcon {
        public id: string;

        constructor(id: string) {
            this.id = id;
        }
    }
    return {
        EventEmitter,
        TreeItem,
        ThemeIcon,
        Uri: {
            file: (path: string) => ({ scheme: 'file', path }),
            joinPath: (base: { path: string }, ...segments: string[]) => ({ scheme: 'file', path: base.path + '/' + segments.join('/') }),
        },
        TreeItemCollapsibleState: {
            Collapsed: 1,
            Expanded: 2,
            None: 0,
        },
    };
});

jest.mock('../../../../logger', () => ({
    logger: {
        trace: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
    componentViewerLogger: {
        trace: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
}));

import { ComponentViewerTreeDataProvider } from '../../component-viewer-tree-view';
import { ComponentViewerWebviewProvider } from '../../component-viewer-webview-provider';

type TestGui = ScvdGuiInterface & {
    getGuiName: () => string | undefined;
    getGuiValue: () => string | undefined;
    getGuiId: () => string | undefined;
    getGuiLineInfo: () => string | undefined;
    hasGuiChildren: () => boolean;
    getGuiChildren: () => ScvdGuiInterface[];
    getGuiEntry: () => { name: string | undefined; value: string | undefined };
    getGuiConditionResult: () => boolean;
    isRootInstance?: boolean;
    isLocked?: boolean;
};

const makeGui = (opts: Partial<TestGui> & { getGuiChildren?: () => ScvdGuiInterface[] }): TestGui => ({
    getGuiName: opts.getGuiName ?? (() => 'Node'),
    getGuiValue: opts.getGuiValue ?? (() => 'Value'),
    getGuiId: opts.getGuiId ?? (() => 'id-1'),
    getGuiLineInfo: opts.getGuiLineInfo ?? (() => undefined),
    hasGuiChildren: opts.hasGuiChildren ?? (() => false),
    getGuiChildren: opts.getGuiChildren ?? (() => []),
    getGuiEntry: opts.getGuiEntry ?? (() => ({ name: 'Node', value: 'Value' })),
    getGuiConditionResult: opts.getGuiConditionResult ?? (() => true),
    isRootInstance: opts.isRootInstance ?? false,
    isLocked: opts.isLocked ?? false,
});

/** Create a mock WebviewView with message capture. */
function makeMockWebviewView() {
    let messageHandler: ((msg: unknown) => void) | undefined;
    const disposeHandlers: (() => void)[] = [];
    const postedMessages: unknown[] = [];
    const webview = {
        options: {} as Record<string, unknown>,
        html: '',
        cspSource: 'https://test-csp-source',
        onDidReceiveMessage: jest.fn((handler: (msg: unknown) => void) => {
            messageHandler = handler;
            return { dispose: jest.fn() };
        }),
        asWebviewUri: jest.fn((uri: { path: string }) => uri),
        postMessage: jest.fn((msg: unknown) => {
            postedMessages.push(msg);
            return Promise.resolve(true);
        }),
    };
    const view = {
        webview,
        onDidDispose: jest.fn((fn: () => void) => {
            disposeHandlers.push(fn);
            return { dispose: jest.fn() };
        }),
    };
    return {
        view: view as unknown as import('vscode').WebviewView,
        getHtml: () => webview.html,
        getPostedMessages: () => postedMessages as HostToWebviewMessage[],
        getLastUpdateMessage: () => {
            const msgs = postedMessages as HostToWebviewMessage[];
            return msgs.filter(m => m.type === 'update').at(-1);
        },
        sendMessage: (msg: unknown) => messageHandler?.(msg),
        triggerDispose: () => disposeHandlers.forEach(fn => fn()),
    };
}

describe('ComponentViewerWebviewProvider', () => {
    let dataProvider: ComponentViewerTreeDataProvider;
    let webviewProvider: ComponentViewerWebviewProvider;

    beforeEach(() => {
        mockFire.mockClear();
        dataProvider = new ComponentViewerTreeDataProvider();
        const vscode = jest.requireMock('vscode') as { Uri: { file: (p: string) => unknown } };
        webviewProvider = new ComponentViewerWebviewProvider(dataProvider, vscode.Uri.file('/test-extension') as never);
    });

    it('sets an HTML shell with a #root element on resolveWebviewView', () => {
        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        expect(getHtml()).toContain('<div id="root">');
        expect(getHtml()).toContain('Content-Security-Policy');
    });

    it('sends an update message with empty rows when no roots are set', () => {
        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        const msg = getLastUpdateMessage();
        expect(msg).toBeDefined();
        expect(msg?.rows).toHaveLength(0);
    });

    it('starts blank when no debug session has provided data yet', () => {
        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        const msg = getLastUpdateMessage();
        expect(msg?.loading).toBe(false);
        expect(msg?.emptyMessage).toBe('');
    });

    it('can show no-data text after a debug session starts loading data', () => {
        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        webviewProvider.setEmptyMessage('No component data available');
        webviewProvider.setLoading(false);

        const msg = getLastUpdateMessage();
        expect(msg?.loading).toBe(false);
        expect(msg?.emptyMessage).toBe('No component data available');
    });

    it('shows a filter-specific empty message when an active filter has no matches', () => {
        const root = makeGui({ getGuiName: () => 'VisibleName', getGuiId: () => 'r1' });
        dataProvider.setRoots([root]);
        dataProvider.setFilter('NoSuchNode');

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const msg = getLastUpdateMessage();
        expect(msg?.rows).toHaveLength(0);
        expect(msg?.emptyMessage).toBe('No matching filter results');
    });

    it('sends a row for each root node with correct cell data', () => {
        const root = makeGui({ getGuiName: () => 'MyName', getGuiValue: () => 'MyVal', getGuiId: () => 'r1' });
        dataProvider.setRoots([root]);
        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        const msg = getLastUpdateMessage();
        expect(msg?.rows).toHaveLength(1);
        expect(msg?.rows[0].name).toBe('MyName');
        expect(msg?.rows[0].value).toBe('MyVal');
        expect(msg?.rows[0].id).toBe('r1');
    });

    it('includes children of expanded nodes', () => {
        const child = makeGui({ getGuiName: () => 'Child', getGuiId: () => 'c1' });
        const parent = makeGui({
            getGuiName: () => 'Parent',
            getGuiId: () => 'p1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([parent]);
        dataProvider.setElementExpanded(parent, true);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        const rows = getLastUpdateMessage()?.rows ?? [];
        expect(rows.some(r => r.name === 'Parent')).toBe(true);
        expect(rows.some(r => r.name === 'Child')).toBe(true);
    });

    it('does not include children of collapsed nodes', () => {
        const child = makeGui({ getGuiName: () => 'HiddenChild', getGuiId: () => 'c1' });
        const parent = makeGui({
            getGuiName: () => 'Parent',
            getGuiId: () => 'p1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([parent]);
        // Not expanded

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        const rows = getLastUpdateMessage()?.rows ?? [];
        expect(rows.some(r => r.name === 'Parent')).toBe(true);
        expect(rows.some(r => r.name === 'HiddenChild')).toBe(false);
    });

    it('auto-expands filtered terms in serialized rows', () => {
        const child = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
        const parent = makeGui({
            getGuiName: () => 'Parent',
            getGuiId: () => 'p1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([parent]);
        dataProvider.setFilter('MatchChild');

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        const rows = getLastUpdateMessage()?.rows ?? [];
        expect(rows.find(r => r.name === 'Parent')?.expanded).toBe(true);
        expect(rows.some(r => r.name === 'MatchChild')).toBe(true);
    });

    it('sends a new update message when refresh() is called', () => {
        const { view, getPostedMessages } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        expect(getPostedMessages().filter(m => (m as HostToWebviewMessage).type === 'update')).toHaveLength(1);

        const root = makeGui({ getGuiName: () => 'Added', getGuiId: () => 'a1' });
        dataProvider.setRoots([root]);
        webviewProvider.refresh();

        const updates = getPostedMessages().filter(m => (m as HostToWebviewMessage).type === 'update');
        expect(updates).toHaveLength(2);
        expect((updates[1] as HostToWebviewMessage & { rows: FlatRow[] }).rows[0].name).toBe('Added');
    });

    it('forwards toggle messages to onToggle callback', () => {
        const toggle = jest.fn();
        webviewProvider.onToggle = toggle;

        const { view, sendMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        sendMessage({ type: 'toggle', id: 'node-1', expanded: true });
        expect(toggle).toHaveBeenCalledWith('node-1', true);
    });

    it('forwards lock messages to onLock callback', () => {
        const lock = jest.fn();
        webviewProvider.onLock = lock;

        const { view, sendMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        sendMessage({ type: 'lock', id: 'root-1' });
        expect(lock).toHaveBeenCalledWith('root-1');
    });

    it('marks root instances with lockEnabled=true in the row', () => {
        const root = makeGui({
            getGuiName: () => 'RTX',
            isRootInstance: true,
            isLocked: false,
            getGuiId: () => 'r1',
        });
        dataProvider.setRoots([root]);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const row = getLastUpdateMessage()?.rows[0];
        expect(row?.lockEnabled).toBe(true);
        expect(row?.locked).toBe(false);
    });

    it('marks locked root instances with locked=true in the row', () => {
        const root = makeGui({
            getGuiName: () => 'RTX',
            isRootInstance: true,
            isLocked: true,
            getGuiId: () => 'r1',
        });
        dataProvider.setRoots([root]);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const row = getLastUpdateMessage()?.rows[0];
        expect(row?.lockEnabled).toBe(true);
        expect(row?.locked).toBe(true);
    });

    it('passes raw name and value strings without HTML escaping', () => {
        const node = makeGui({
            getGuiName: () => '<b>bold</b>',
            getGuiValue: () => 'a & b',
            getGuiId: () => 'n1',
        });
        dataProvider.setRoots([node]);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const row = getLastUpdateMessage()?.rows[0];
        // Raw strings go into name/value — React handles escaping
        expect(row?.name).toBe('<b>bold</b>');
        expect(row?.value).toBe('a & b');
    });

    it('cleans up on dispose', () => {
        const { view, triggerDispose } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        triggerDispose();

        // After dispose, refresh should be a no-op (no-op since _view is cleared).
        expect(() => webviewProvider.refresh()).not.toThrow();
    });

    it('sets correct depth values for nested children', () => {
        const grandchild = makeGui({ getGuiName: () => 'GC', getGuiId: () => 'gc1' });
        const child = makeGui({
            getGuiName: () => 'Child',
            getGuiId: () => 'c1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [grandchild],
        });
        const root = makeGui({
            getGuiName: () => 'Root',
            getGuiId: () => 'r1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([root]);
        dataProvider.setElementExpanded(root, true);
        dataProvider.setElementExpanded(child, true);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const rows = getLastUpdateMessage()?.rows ?? [];
        const rootRow = rows.find(r => r.name === 'Root');
        const childRow = rows.find(r => r.name === 'Child');
        const gcRow = rows.find(r => r.name === 'GC');

        expect(rootRow?.depth).toBe(0);
        expect(childRow?.depth).toBe(1);
        expect(gcRow?.depth).toBe(2);
    });

    it('sends updated data when the data provider fires onDidChangeTreeData', () => {
        let changeListener: (() => void) | undefined;
        Object.defineProperty(dataProvider, 'onDidChangeTreeData', {
            value: (listener: () => void) => {
                changeListener = listener;
                return { dispose: jest.fn() };
            },
            configurable: true,
        });

        const { view, getPostedMessages } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        dataProvider.setRoots([makeGui({ getGuiName: () => 'Dynamic', getGuiId: () => 'd1' })]);
        changeListener?.();

        const updates = getPostedMessages().filter(m => (m as HostToWebviewMessage).type === 'update');
        expect(updates).toHaveLength(2);
        expect(((updates[1] as HostToWebviewMessage & { rows: FlatRow[] }).rows[0].name)).toBe('Dynamic');
    });

    it('skips a node whose getGuiId returns undefined', () => {
        const good = makeGui({ getGuiName: () => 'Good', getGuiId: () => 'ok' });
        const bad = makeGui({ getGuiName: () => 'Bad', getGuiId: () => undefined });
        dataProvider.setRoots([good, bad]);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const rows = getLastUpdateMessage()?.rows ?? [];
        expect(rows.some(r => r.name === 'Good')).toBe(true);
        expect(rows.some(r => r.name === 'Bad')).toBe(false);
    });

    it('uses empty string for missing name or value', () => {
        const nodeNameOnly = makeGui({
            getGuiName: () => 'OnlyName',
            getGuiValue: () => undefined,
            getGuiId: () => 'n1',
        });
        const nodeValueOnly = makeGui({
            getGuiName: () => undefined,
            getGuiValue: () => 'OnlyValue',
            getGuiId: () => 'v1',
        });

        dataProvider.setRoots([nodeNameOnly, nodeValueOnly]);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const rows = getLastUpdateMessage()?.rows ?? [];
        const nameOnlyRow = rows.find(r => r.id === 'n1');
        const valueOnlyRow = rows.find(r => r.id === 'v1');

        expect(nameOnlyRow?.name).toBe('OnlyName');
        expect(nameOnlyRow?.value).toBe('');
        expect(valueOnlyRow?.name).toBe('');
        expect(valueOnlyRow?.value).toBe('OnlyValue');
    });

    it('includes a node with neither name nor value using its id', () => {
        const nodeNeither = makeGui({
            getGuiName: () => undefined,
            getGuiValue: () => undefined,
            getGuiId: () => 'e1',
        });
        dataProvider.setRoots([nodeNeither]);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const rows = getLastUpdateMessage()?.rows ?? [];
        expect(rows.some(r => r.id === 'e1')).toBe(true);
    });

    it('includes the CSP meta tag in the HTML shell', () => {
        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        expect(getHtml()).toContain('Content-Security-Policy');
    });

    it('marks expanded rows with expanded=true', () => {
        const child = makeGui({ getGuiName: () => 'Child', getGuiId: () => 'c1' });
        const parent = makeGui({
            getGuiName: () => 'Parent',
            getGuiId: () => 'p1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([parent]);
        dataProvider.setElementExpanded(parent, true);

        const { view, getLastUpdateMessage } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const rows = getLastUpdateMessage()?.rows ?? [];
        const parentRow = rows.find(r => r.id === 'p1');
        expect(parentRow?.expanded).toBe(true);
        expect(parentRow?.hasChildren).toBe(true);
    });
});
