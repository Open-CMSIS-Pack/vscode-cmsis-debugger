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
 * Unit tests for InterruptHost.
 */

import * as vscode from 'vscode';
import { InterruptHost } from '../../../data-host/interrupt-host';
import type { IPeripheralInspectorAPI, InterruptTable } from '@eclipse-cdt-cloud/vscode-peripheral-inspector/api';

jest.mock('../../../../../logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
    componentViewerLogger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        trace: jest.fn(),
    },
}));

const PERIPHERAL_INSPECTOR_EXTENSION_ID = 'eclipse-cdt.peripheral-inspector';

const sampleTable: InterruptTable = {
    interrupts: {
        0: { name: 'WWDG_IRQn', value: 0, description: 'Window Watchdog' },
        1: { name: 'PVD_IRQn', value: 1 },
        16: { name: 'SysTick_IRQn', value: 16, description: 'System Tick Timer' },
    }
};

function mockExtension(opts: {
    isActive?: boolean;
    exports?: Partial<IPeripheralInspectorAPI>;
    activateResult?: Partial<IPeripheralInspectorAPI>;
} = {}) {
    const { isActive = true, exports = {}, activateResult } = opts;
    const ext = {
        isActive,
        exports: {
            registerSVDFile: jest.fn(),
            getSVDFile: jest.fn(),
            getSVDFileFromCortexDebug: jest.fn(),
            registerPeripheralsProvider: jest.fn(),
            ...exports,
        } as IPeripheralInspectorAPI,
        activate: jest.fn().mockResolvedValue(activateResult ?? exports),
    };
    (vscode.extensions.getExtension as jest.Mock).mockReturnValue(ext);
    return ext;
}

describe('InterruptHost', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
    });

    it('calls getExtension in constructor', () => {
        new InterruptHost();
        expect(vscode.extensions.getExtension).toHaveBeenCalledWith(PERIPHERAL_INSPECTOR_EXTENSION_ID);
    });

    it('returns undefined when no extension is found', async () => {
        const host = new InterruptHost();
        host.setSvdPath('/path/to/file.svd');
        expect(await host.getName(0)).toBeUndefined();
        expect(await host.getEntry(0)).toBeUndefined();
    });

    it('returns undefined when no svdPath is set', async () => {
        mockExtension({ exports: { getInterruptTable: jest.fn().mockReturnValue(sampleTable) } });
        const host = new InterruptHost();
        expect(await host.getName(0)).toBeUndefined();
    });

    it('fetches and caches the interrupt table on first lookup', async () => {
        const getInterruptTable = jest.fn().mockReturnValue(sampleTable);
        mockExtension({ exports: { getInterruptTable } });

        const host = new InterruptHost();
        host.setSvdPath('/path/to/file.svd');

        expect(host.isFetched).toBe(false);

        const name = await host.getName(0);
        expect(name).toBe('WWDG_IRQn');
        expect(host.isFetched).toBe(true);
        expect(getInterruptTable).toHaveBeenCalledWith('/path/to/file.svd');

        // Second call should use cache, not call getInterruptTable again
        const name2 = await host.getName(16);
        expect(name2).toBe('SysTick_IRQn');
        expect(getInterruptTable).toHaveBeenCalledTimes(1);
    });

    it('returns entry with full interrupt information', async () => {
        mockExtension({ exports: { getInterruptTable: jest.fn().mockReturnValue(sampleTable) } });

        const host = new InterruptHost();
        host.setSvdPath('/path/to/file.svd');

        const entry = await host.getEntry(0);
        expect(entry).toEqual({ name: 'WWDG_IRQn', value: 0, description: 'Window Watchdog' });
    });

    it('returns undefined for unknown interrupt numbers', async () => {
        mockExtension({ exports: { getInterruptTable: jest.fn().mockReturnValue(sampleTable) } });

        const host = new InterruptHost();
        host.setSvdPath('/path/to/file.svd');

        expect(await host.getName(999)).toBeUndefined();
        expect(await host.getEntry(999)).toBeUndefined();
    });

    it('does not re-fetch when svdPath changes after initial fetch (one-shot)', async () => {
        const getInterruptTable = jest.fn().mockReturnValue(sampleTable);
        mockExtension({ exports: { getInterruptTable } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        expect(await host.getName(0)).toBe('WWDG_IRQn');
        expect(host.isFetched).toBe(true);

        // Change svdPath — one-shot means no re-fetch
        host.setSvdPath('/path/b.svd');
        expect(host.isFetched).toBe(true);

        // Still returns the originally cached table
        expect(await host.getName(0)).toBe('WWDG_IRQn');
        expect(getInterruptTable).toHaveBeenCalledTimes(1);
    });

    it('does not reset cache when svdPath is set to the same value', async () => {
        const getInterruptTable = jest.fn().mockReturnValue(sampleTable);
        mockExtension({ exports: { getInterruptTable } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        await host.getName(0);
        expect(host.isFetched).toBe(true);

        // Set same path again — should NOT reset
        host.setSvdPath('/path/a.svd');
        expect(host.isFetched).toBe(true);
        expect(getInterruptTable).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when extension is not yet active', async () => {
        const getInterruptTable = jest.fn().mockReturnValue(sampleTable);
        const ext = mockExtension({ isActive: false, exports: { getInterruptTable } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        const name = await host.getName(0);
        expect(ext.activate).not.toHaveBeenCalled();
        expect(name).toBeUndefined();
    });

    it('handles missing getInterruptTable method gracefully', async () => {
        mockExtension({ exports: {} });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        expect(await host.getName(0)).toBeUndefined();
        expect(host.isFetched).toBe(true);
    });

    it('handles getInterruptTable returning undefined', async () => {
        mockExtension({ exports: { getInterruptTable: jest.fn().mockReturnValue(undefined) } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        expect(await host.getName(0)).toBeUndefined();
        expect(host.isFetched).toBe(true);
    });

    it('returns undefined when extension is inactive without attempting activation', async () => {
        const ext = mockExtension({ isActive: false, exports: {} });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        expect(await host.getName(0)).toBeUndefined();
        expect(host.isFetched).toBe(true);
        expect(ext.activate).not.toHaveBeenCalled();
    });

    it('one-shot: setting svdPath after first lookup is too late', async () => {
        mockExtension({ exports: { getInterruptTable: jest.fn().mockReturnValue(sampleTable) } });

        const host = new InterruptHost();
        // First lookup without svdPath — marks _fetched = true
        expect(await host.getName(0)).toBeUndefined();
        expect(host.isFetched).toBe(true);

        // Now set svdPath — too late, already fetched
        host.setSvdPath('/path/a.svd');
        expect(await host.getName(0)).toBeUndefined();
    });

    it('one-shot: no retry after extension not found', async () => {
        // No extension registered
        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        expect(await host.getName(0)).toBeUndefined();
        expect(host.isFetched).toBe(true);

        // Second call should not attempt to find the extension again
        expect(await host.getEntry(0)).toBeUndefined();
        expect(vscode.extensions.getExtension).toHaveBeenCalledTimes(1); // only in constructor
    });

    it('one-shot: no retry when extension is inactive', async () => {
        const ext = mockExtension({ isActive: false, exports: { getInterruptTable: jest.fn().mockReturnValue(sampleTable) } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        expect(await host.getName(0)).toBeUndefined();

        // Second call — still returns undefined, no activation attempted
        expect(await host.getName(0)).toBeUndefined();
        expect(ext.activate).not.toHaveBeenCalled();
    });

    it('concurrent lookups only trigger a single fetch', async () => {
        const getInterruptTable = jest.fn().mockReturnValue(sampleTable);
        mockExtension({ exports: { getInterruptTable } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        const [name0, name1, entry16] = await Promise.all([
            host.getName(0),
            host.getName(1),
            host.getEntry(16),
        ]);

        expect(name0).toBe('WWDG_IRQn');
        expect(name1).toBe('PVD_IRQn');
        expect(entry16).toEqual({ name: 'SysTick_IRQn', value: 16, description: 'System Tick Timer' });
        expect(getInterruptTable).toHaveBeenCalledTimes(1);
    });

    it('returns entry without description when field is absent', async () => {
        mockExtension({ exports: { getInterruptTable: jest.fn().mockReturnValue(sampleTable) } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        const entry = await host.getEntry(1);
        expect(entry).toEqual({ name: 'PVD_IRQn', value: 1 });
        expect(entry?.description).toBeUndefined();
    });

    it('does not call activate when extension is already active', async () => {
        const getInterruptTable = jest.fn().mockReturnValue(sampleTable);
        const ext = mockExtension({ isActive: true, exports: { getInterruptTable } });

        const host = new InterruptHost();
        host.setSvdPath('/path/a.svd');

        await host.getName(0);
        expect(ext.activate).not.toHaveBeenCalled();
    });
});
