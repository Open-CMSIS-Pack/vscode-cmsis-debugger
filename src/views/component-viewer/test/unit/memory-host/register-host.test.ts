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
// generated with AI

/**
 * Unit test for RegisterHost.
 */

import { RegisterHost } from '../../../data-host/register-host';

describe('RegisterHost', () => {
    it('normalizes register names and stores values', () => {
        const host = new RegisterHost();
        host.write(' r0 ', 0x1234);

        expect(host.read('R0')).toBe(0x1234);
        expect(host.read('r0')).toBe(0x1234);
    });

    it('handles empty register names with errors', () => {
        const host = new RegisterHost();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(host.read('')).toBeUndefined();
        expect(host.write('', 1)).toBeUndefined();

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('truncates values to uint32', () => {
        const host = new RegisterHost();
        host.write('r1', 0x1_0000_0001);
        host.write('r2', 0x1_0000_0001n);

        expect(host.read('r1')).toBe(1);
        expect(host.read('r2')).toBe(1n);
    });

    it('returns the original value from write', () => {
        const host = new RegisterHost();

        expect(host.write('r5', 5)).toBe(5);
        expect(host.write('r6', 6n)).toBe(6n);
    });

    it('invalidates and clears cached registers', () => {
        const host = new RegisterHost();
        host.write('r3', 3);
        host.write('r4', 4);

        host.invalidate('r3');
        expect(host.read('r3')).toBeUndefined();
        expect(host.read('r4')).toBe(4);

        host.clear();
        expect(host.read('r4')).toBeUndefined();
    });
});
