/**
 * Copyright 2026 Arm Limited
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

import * as path from 'path';
import { CorePeripheralsScvdCollector } from './core-peripherals-scvd-collector';
import { gdbTargetDebugSessionFactory } from '../../debug-session/__test__/debug-session.factory';

const TEST_BASE_PATH = path.resolve(__dirname, '../../../configs/core-peripherals');
const EXPECTED_CORE_PERIPHERAL_FILES = [
    'Memory_Protection_Unit.scvd',
    'Nested_Vectored_Interrupt_Controller.scvd',
    'System_Config_and_Control.scvd',
    'System_Tick_Timer.scvd',
];
const EXPECTED_CORE_PERIPHERAL_FILE_PATHS = EXPECTED_CORE_PERIPHERAL_FILES.map(
    file => path.resolve(TEST_BASE_PATH, file)
);


describe('CorePeripheralsScvdCollector', () => {

    it('finds all expected SCVD files', async () => {
        const corePeripheralsScvdCollector = new CorePeripheralsScvdCollector(TEST_BASE_PATH);
        const debugSession = gdbTargetDebugSessionFactory('TestSession', [], 'unknown');
        const scvdFilePaths = await corePeripheralsScvdCollector.getScvdFilePaths(debugSession);
        expect(scvdFilePaths.length).toBe(EXPECTED_CORE_PERIPHERAL_FILE_PATHS.length);
        EXPECTED_CORE_PERIPHERAL_FILE_PATHS.forEach(filePath => {
            expect(scvdFilePaths.includes(filePath)).toBe(true);
        });
    });

});
