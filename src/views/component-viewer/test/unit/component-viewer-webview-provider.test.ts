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

/** Create a mock WebviewView with a writable `html` and message capture. */
function makeMockWebviewView() {
    let messageHandler: ((msg: unknown) => void) | undefined;
    const disposeHandlers: (() => void)[] = [];
    const webview = {
        options: {} as Record<string, unknown>,
        html: '',
        onDidReceiveMessage: jest.fn((handler: (msg: unknown) => void) => {
            messageHandler = handler;
            return { dispose: jest.fn() };
        }),
        asWebviewUri: jest.fn((uri: { path: string }) => uri),
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

    it('renders empty state when no roots are set', () => {
        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        expect(getHtml()).toContain('No component data available');
        expect(getHtml()).not.toContain('<table');
    });

    it('renders a table with Name and Value columns', () => {
        const root = makeGui({ getGuiName: () => 'MyName', getGuiValue: () => 'MyVal' });
        dataProvider.setRoots([root]);
        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const html = getHtml();
        expect(html).toContain('<table');
        expect(html).toContain('Name');
        expect(html).toContain('Value');
        expect(html).toContain('MyName');
        expect(html).toContain('MyVal');
    });

    it('renders children of expanded nodes', () => {
        const child = makeGui({ getGuiName: () => 'Child', getGuiId: () => 'c1' });
        const parent = makeGui({
            getGuiName: () => 'Parent',
            getGuiId: () => 'p1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([parent]);
        dataProvider.setElementExpanded(parent, true);

        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const html = getHtml();
        expect(html).toContain('Parent');
        expect(html).toContain('Child');
    });

    it('does not render children of collapsed nodes', () => {
        const child = makeGui({ getGuiName: () => 'HiddenChild', getGuiId: () => 'c1' });
        const parent = makeGui({
            getGuiName: () => 'Parent',
            getGuiId: () => 'p1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        dataProvider.setRoots([parent]);
        // Not expanded → children should not appear

        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        expect(getHtml()).toContain('Parent');
        expect(getHtml()).not.toContain('HiddenChild');
    });

    it('re-renders when refresh() is called', () => {
        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        expect(getHtml()).toContain('No component data available');

        const root = makeGui({ getGuiName: () => 'Added' });
        dataProvider.setRoots([root]);
        // The mock EventEmitter doesn't wire up real subscriptions,
        // so call refresh() explicitly to simulate what happens in production.
        webviewProvider.refresh();

        expect(getHtml()).toContain('Added');
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

    it('shows lock/unlock button for root instances', () => {
        const root = makeGui({
            getGuiName: () => 'RTX',
            isRootInstance: true,
            isLocked: false,
        });
        dataProvider.setRoots([root]);

        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        expect(getHtml()).toContain('lock-btn');
        expect(getHtml()).toContain('🔓');
    });

    it('shows locked icon for locked root instances', () => {
        const root = makeGui({
            getGuiName: () => 'RTX',
            isRootInstance: true,
            isLocked: true,
        });
        dataProvider.setRoots([root]);

        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        expect(getHtml()).toContain('🔒');
    });

    it('escapes HTML entities in names and values', () => {
        const node = makeGui({
            getGuiName: () => '<b>bold</b>',
            getGuiValue: () => 'a & b',
        });
        dataProvider.setRoots([node]);

        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const html = getHtml();
        // The node name must be escaped, not rendered as raw HTML.
        expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
        expect(html).not.toContain('<b>bold</b>');
        expect(html).toContain('a &amp; b');
    });

    it('cleans up on dispose', () => {
        const { view, triggerDispose, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);
        triggerDispose();

        // After dispose, refresh should not throw (no-op since _view is cleared).
        webviewProvider.refresh();
        // HTML should remain from last render but provider is detached.
        expect(getHtml()).toBeDefined();
    });

    it('indents nested children with increasing padding', () => {
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

        const { view, getHtml } = makeMockWebviewView();
        webviewProvider.resolveWebviewView(view, {} as never, {} as never);

        const html = getHtml();
        // Root at depth 0: padding-left:4px, child at depth 1: 20px, grandchild at depth 2: 36px
        expect(html).toContain('padding-left:4px');
        expect(html).toContain('padding-left:20px');
        expect(html).toContain('padding-left:36px');
    });
});
