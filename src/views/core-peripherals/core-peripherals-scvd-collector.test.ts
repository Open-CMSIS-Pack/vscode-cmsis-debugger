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

import * as path from 'path';
import { CorePeripheralsScvdCollector } from './core-peripherals-scvd-collector';
import { gdbTargetDebugSessionFactory } from '../../debug-session/__test__/debug-session.factory';

const TEST_BASE_PATH = path.resolve(__dirname, '../../../configs/core-peripherals');
const EXPECTED_DEFAULT_CORE_PERIPHERAL_FILES = [
    'Nested_Vectored_Interrupt_Controller.scvd',
    'System_Config_and_Control.scvd',
    'System_Tick_Timer.scvd',
    'Fault_Reports.scvd',
];
const EXPECTED_DEFAULT_CORE_PERIPHERAL_FILE_PATHS = EXPECTED_DEFAULT_CORE_PERIPHERAL_FILES.map(
    file => path.resolve(TEST_BASE_PATH, file)
);
const EMPTY_INDEX_PATH = path.resolve(__dirname, '../../../test-data/core-peripherals/empty-index');
const NO_PERIPHERALS_INDEX_PATH = path.resolve(__dirname, '../../../test-data/core-peripherals/no-peripherals');
const COMPLEX_INDEX_PATH = path.resolve(__dirname, '../../../test-data/core-peripherals/complex-index');

const TEST_PROCESSOR_M33_TZ_DP = {
    core: 'Cortex-M33',
    revision: 'r0p0',
    'max-clock': 100,
    pname: 'core0',
    fpu: 'dp',
    mpu: 'present',
    trustzone: 'present',
};

const TEST_PROCESSOR_M33_NO_TZ_DP = {
    core: 'Cortex-M33',
    revision: 'r0p0',
    'max-clock': 100,
    pname: 'core1',
    fpu: 'dp',
    mpu: 'present',
    trustzone: 'none',
};

const TEST_PROCESSOR_M55_SP = {
    core: 'Cortex-M55',
    revision: 'r0p0',
    'max-clock': 100,
    pname: 'core2',
    fpu: 'sp',
    mpu: 'present',
    trustzone: 'present',
};

const TEST_PROCESSOR_M85 = {
    core: 'Cortex-M85',
    revision: 'r0p0',
    'max-clock': 100,
    pname: 'core3',
    fpu: 'sp',
    mpu: 'present',
    trustzone: 'none',
};

const TEST_PROCESSOR_M0P = {
    core: 'Cortex-M0+',
    revision: 'r0p0',
    'max-clock': 100,
};

const TEST_PROCESSORS = [
    TEST_PROCESSOR_M33_TZ_DP,
    TEST_PROCESSOR_M33_NO_TZ_DP,
    TEST_PROCESSOR_M55_SP,
    TEST_PROCESSOR_M85
];

describe('CorePeripheralsScvdCollector', () => {

    it('returns all SCVD files that have no conditions', async () => {
        const corePeripheralsScvdCollector = new CorePeripheralsScvdCollector(TEST_BASE_PATH);
        // Use real session implementation for this test
        const debugSession = gdbTargetDebugSessionFactory('session-id');
        const scvdFilePaths = await corePeripheralsScvdCollector.getScvdFilePaths(debugSession);
        expect(scvdFilePaths.length).toBe(EXPECTED_DEFAULT_CORE_PERIPHERAL_FILE_PATHS.length);
        EXPECTED_DEFAULT_CORE_PERIPHERAL_FILE_PATHS.forEach(filePath => {
            expect(scvdFilePaths.includes(filePath)).toBe(true);
        });
    });

    it('returns no SCVD files for empty index file', async () => {
        const corePeripheralsScvdCollector = new CorePeripheralsScvdCollector(EMPTY_INDEX_PATH);
        // Use real session implementation for this test
        const debugSession = gdbTargetDebugSessionFactory('session-id');
        const scvdFilePaths = await corePeripheralsScvdCollector.getScvdFilePaths(debugSession);
        expect(scvdFilePaths).toEqual([]);
    });

    it('returns no SCVD files for index file without file entries', async () => {
        const corePeripheralsScvdCollector = new CorePeripheralsScvdCollector(NO_PERIPHERALS_INDEX_PATH);
        // Use real session implementation for this test
        const debugSession = gdbTargetDebugSessionFactory('session-id');
        const scvdFilePaths = await corePeripheralsScvdCollector.getScvdFilePaths(debugSession);
        expect(scvdFilePaths).toEqual([]);
    });

    it.each([
        { pname: 'core0', expected: [ 'TZ_MPU_Cortex-M33.scvd', 'FPU_All.scvd', 'System_Tick_Timer.scvd'] },
        { pname: 'core1', expected: [ 'FPU_All.scvd', 'System_Tick_Timer.scvd'] },
        { pname: 'core2', expected: [ 'M55_M85_Nested_Vectored_Interrupt_Controller.scvd', 'FPU_SP.scvd', 'FPU_All.scvd', 'System_Tick_Timer.scvd'] },
        { pname: 'core3', expected: [ 'M55_M85_Nested_Vectored_Interrupt_Controller.scvd', 'FPU_SP.scvd', 'FPU_All.scvd', 'System_Tick_Timer.scvd'] },
        // No matching processor, load defaults without restrictions.
        { pname: 'no-match', expected: [ 'System_Tick_Timer.scvd'] },
        // No pname info, should fallback to first entry which is M33 with TZ and DP
        { pname: undefined, expected: [ 'TZ_MPU_Cortex-M33.scvd', 'FPU_All.scvd', 'System_Tick_Timer.scvd'] },
    ])('filters SCVD files as expected for complex index file and multi-core setup (pname: $pname)', async ({ pname, expected }) => {
        const resolvedExpected = expected.map(file => path.resolve(COMPLEX_INDEX_PATH, file));
        const corePeripheralsScvdCollector = new CorePeripheralsScvdCollector(COMPLEX_INDEX_PATH);
        // Use real session implementation for this test
        const debugSession = gdbTargetDebugSessionFactory('session-id', [], 'unknown', pname);
        const cbuildRunReader = await debugSession.getCbuildRun();
        (cbuildRunReader?.getContents as jest.Mock).mockReturnValue({ 'system-resources': { processors: TEST_PROCESSORS } });
        const scvdFilePaths = await corePeripheralsScvdCollector.getScvdFilePaths(debugSession);
        expect(scvdFilePaths).toEqual(resolvedExpected);
    });

    it.each([
        // No matching processor, load defaults without restrictions.
        { pname: 'no-match', expected: [ 'System_Tick_Timer.scvd' ] },
        { pname: undefined, expected: [ 'M0_M23_Nested_Vectored_Interrupt_Controller.scvd', 'System_Tick_Timer.scvd' ] },
    ])('filters SCVD files as expected for complex index file and single-core setup (pname: $pname)', async ({ pname, expected }) => {
        const resolvedExpected = expected.map(file => path.resolve(COMPLEX_INDEX_PATH, file));
        const corePeripheralsScvdCollector = new CorePeripheralsScvdCollector(COMPLEX_INDEX_PATH);
        // Use real session implementation for this test
        const debugSession = gdbTargetDebugSessionFactory('session-id', [], 'unknown', pname);
        const cbuildRunReader = await debugSession.getCbuildRun();
        (cbuildRunReader?.getContents as jest.Mock).mockReturnValue({ 'system-resources': { processors: [ TEST_PROCESSOR_M0P ] } });
        const scvdFilePaths = await corePeripheralsScvdCollector.getScvdFilePaths(debugSession);
        expect(scvdFilePaths).toEqual(resolvedExpected);
    });

});
