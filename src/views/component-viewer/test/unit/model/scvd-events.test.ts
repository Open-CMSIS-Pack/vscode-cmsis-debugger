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
 * Unit test for ScvdEvents.
 */

import { ScvdEvent } from '../../../model/scvd-event';
import { ScvdEvents } from '../../../model/scvd-events';
import { ScvdGroup } from '../../../model/scvd-group';
import { Json } from '../../../model/scvd-base';

describe('ScvdEvents', () => {
    it('returns false when XML is undefined', () => {
        const events = new ScvdEvents(undefined);
        expect(events.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('creates event and group entries from xml', () => {
        const events = new ScvdEvents(undefined);
        const eventSpy = jest.spyOn(ScvdEvent.prototype, 'readXml').mockReturnValue(true);
        const groupSpy = jest.spyOn(ScvdGroup.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            event: { id: 'evt' },
            group: { name: 'group' }
        };

        expect(events.readXml(xml)).toBe(true);
        expect(events.event).toHaveLength(1);
        expect(events.group).toHaveLength(1);
        expect(eventSpy).toHaveBeenCalledTimes(1);
        expect(groupSpy).toHaveBeenCalledTimes(1);

        eventSpy.mockRestore();
        groupSpy.mockRestore();
    });

    it('adds events and groups directly', () => {
        const events = new ScvdEvents(undefined);
        const event = events.addEvent();
        const group = events.addGroup();

        expect(events.event).toEqual([event]);
        expect(events.group).toEqual([group]);
    });
});
