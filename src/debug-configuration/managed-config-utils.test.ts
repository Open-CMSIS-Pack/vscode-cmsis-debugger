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

import { getManagedConfigBaseName, hasManagedConfigEnding } from './managed-config-utils';

describe('Managed Config Utils', () => {

    describe('hasManagedConfigEnding', () => {

        it('returns true for \'(launch)\' and \'(attach)\' ending', () => {
            expect(hasManagedConfigEnding('My Config (launch)')).toBe(true);
            expect(hasManagedConfigEnding('My Config (attach)')).toBe(true);
        });

        it('returns false without \'(launch)\' or \'(attach)\' ending', () => {
            expect(hasManagedConfigEnding('My Config')).toBe(false);
        });

        it('returns false with \'(launch)\' or \'(attach)\' but not at the end', () => {
            expect(hasManagedConfigEnding('My Config (launch something)')).toBe(false);
            expect(hasManagedConfigEnding('My Config (attach) xyz')).toBe(false);
        });

    });

    describe('getManagedConfigBaseName', () => {

        it('returns base name without \'(launch)\' or \'(attach)\' ending', () => {
            expect(getManagedConfigBaseName('My Launch Config (launch)')).toBe('My Launch Config');
            expect(getManagedConfigBaseName('My Attach Config (attach)')).toBe('My Attach Config');
        });

        it('returns full name if no \'(launch)\' or \'(attach)\' ending', () => {
            expect(getManagedConfigBaseName('My (launch) Config')).toBe('My (launch) Config');
            expect(getManagedConfigBaseName('My Config (attach')).toBe('My Config (attach');
            expect(getManagedConfigBaseName('My Config')).toBe('My Config');
        });

    });

});
