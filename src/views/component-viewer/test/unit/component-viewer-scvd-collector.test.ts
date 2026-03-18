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

import { gdbTargetDebugSessionFactory } from '../../../../debug-session/__test__/debug-session.factory';
import { ComponentViewerScvdCollector } from '../../component-viewer-scvd-collector';

describe('ComponentViewerScvdCollector', () => {
    let componentViewerScvdCollector: ComponentViewerScvdCollector;

    beforeEach(() => {
        componentViewerScvdCollector = new ComponentViewerScvdCollector();
    });

    it.each([
        {
            inputFilePaths: ['path/to/scvd1.scvd', 'path/to/scvd2.scvd'],
            pname: undefined,
        },
        {
            inputFilePaths: [],
            pname: 'test-pname',
        }
    ])('returns scvd files as registered in the session', async ({ inputFilePaths, pname }) => {
        const session = gdbTargetDebugSessionFactory('test-session-id', inputFilePaths, 'unknown', pname);
        const cbuildRunReader = await session.getCbuildRun();
        expect(cbuildRunReader).toBeDefined();
        const cbuildRunGetScvdSpy = jest.spyOn(cbuildRunReader!, 'getScvdFilePaths');
        const receivedPaths = await componentViewerScvdCollector.getScvdFilePaths(session);
        expect(cbuildRunGetScvdSpy).toHaveBeenCalledWith(undefined, pname);
        expect(receivedPaths).toEqual(expect.arrayContaining(inputFilePaths));
    });

    it('returns empty array if cbuildRun reader is undefined', async () => {
        const inputFilePaths = ['path/to/scvd1.scvd', 'path/to/scvd2.scvd'];
        const session = gdbTargetDebugSessionFactory('test-session-id', inputFilePaths, 'unknown', undefined, false);
        const receivedPaths = await componentViewerScvdCollector.getScvdFilePaths(session);
        expect(receivedPaths).toEqual([]);
    });

});
