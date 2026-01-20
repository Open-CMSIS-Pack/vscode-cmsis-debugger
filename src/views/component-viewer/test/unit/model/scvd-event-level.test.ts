/**
 * Copyright 2025-2026 Arm Limited
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
 *
 * Unit test for ScvdEventLevel.
 */

import { EventLevel, EventLevelMap, EventLevelReverseMap, ScvdEventLevel } from '../../../model/scvd-event-level';

describe('ScvdEventLevel', () => {
    it('maps between string and enum values', () => {
        expect(EventLevelMap.get('Error')).toBe(EventLevel.EventLevelError);
        expect(EventLevelReverseMap.get(EventLevel.EventLevelAPI)).toBe('API');
    });

    it('assigns levels via map and enum keys', () => {
        const level = new ScvdEventLevel(undefined, 'Error');
        expect(level.level).toBe(EventLevel.EventLevelError);

        level.level = 'EventLevelDetail';
        expect(level.level).toBe(EventLevel.EventLevelDetail);
    });

    it('handles unknown level strings', () => {
        const level = new ScvdEventLevel(undefined, 'Missing');
        expect(level.level).toBeUndefined();
        expect(level.filterLevel(EventLevel.EventLevelDetail)).toBe(true);

        level.level = 'AlsoMissing';
        expect(level.level).toBeUndefined();

        level.level = undefined;
        expect(level.level).toBeUndefined();
    });

    it('filters levels appropriately', () => {
        const level = new ScvdEventLevel(undefined, 'API');
        expect(level.filterLevel(EventLevel.EventLevelDetail)).toBe(true);
        expect(level.filterLevel(EventLevel.EventLevelError)).toBe(false);
    });
});
