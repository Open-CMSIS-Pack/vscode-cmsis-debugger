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

import { describe, expect, it } from '@jest/globals';
import { isPrimaryModifierPressed } from './csv-table-modifiers';

describe('CSV table primary modifier', () => {
    it.each(['MacIntel', 'MacPPC', 'Win32', 'Linux x86_64'])(
        'uses the platform modifier on %s', platform => {
            const isMac = platform.startsWith('Mac');
            expect(isPrimaryModifierPressed({ ctrlKey: false, metaKey: true }, platform)).toBe(isMac);
            expect(isPrimaryModifierPressed({ ctrlKey: true, metaKey: false }, platform)).toBe(!isMac);
            expect(isPrimaryModifierPressed({ ctrlKey: false, metaKey: false }, platform)).toBe(false);
            expect(isPrimaryModifierPressed({ ctrlKey: true, metaKey: true }, platform)).toBe(true);
        },
    );
});
