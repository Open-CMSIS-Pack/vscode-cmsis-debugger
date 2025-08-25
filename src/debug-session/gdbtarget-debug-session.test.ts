/**
 * Copyright 2025 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode';
import { debugSessionFactory } from '../__test__/vscode.factory';
import { GDBTargetDebugSession } from './gdbtarget-debug-session';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root

describe('GDBTargetDebugSession', () => {
    const defaultConfig = () => {
        return {
            name: 'session-name',
            type: 'gdbtarget',
            request: 'launch'
        };
    };

    let debugSession: vscode.DebugSession;

    beforeEach(() => {
        debugSession = debugSessionFactory(defaultConfig());
    });

    it('can create a GDBTargetDebugSession', () => {
        const gdbtargetSession = new GDBTargetDebugSession(debugSession);
        expect(gdbtargetSession).toBeDefined();
    });

    it('returns an undefined cbuild object of not parsing one', async () => {
        const gdbtargetSession = new GDBTargetDebugSession(debugSession);
        const cbuildRun = await gdbtargetSession.getCbuildRun();
        expect(cbuildRun).toBeUndefined();
    });

    it('returns a cbuild object after parsing one', async () => {
        const gdbtargetSession = new GDBTargetDebugSession(debugSession);
        await gdbtargetSession.parseCbuildRun(TEST_CBUILD_RUN_FILE);
        const cbuildRun = await gdbtargetSession.getCbuildRun();
        expect(cbuildRun).toMatchSnapshot();
    });
});
