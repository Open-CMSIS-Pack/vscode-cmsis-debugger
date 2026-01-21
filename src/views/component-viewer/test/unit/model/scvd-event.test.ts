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
 */

// generated with AI

/**
 * Unit test for ScvdEvent.
 */

import { Json } from '../../../model/scvd-base';
import { ScvdEvent } from '../../../model/scvd-event';
import { ScvdEventTrackingMode } from '../../../model/scvd-event-tracking';
import { ScvdEventState } from '../../../model/scvd-event-state';

describe('ScvdEvent', () => {
    it('reads XML and populates event fields', () => {
        const event = new ScvdEvent(undefined);
        expect(event.readXml(undefined as unknown as Json)).toBe(false);

        const xml: Json = {
            id: '1',
            level: '1',
            property: 'prop',
            value: 'val',
            doc: 'doc',
            handle: '2',
            hname: 'hname',
            state: 'ready',
            tracking: 'Start',
            print: { name: 'print', value: '1' }
        };

        expect(event.readXml(xml)).toBe(true);
        expect(event.id).toBeDefined();
        expect(event.level).toBeDefined();
        expect(event.property).toBeDefined();
        expect(event.value).toBeDefined();
        expect(event.doc).toBe('doc');
        expect(event.handle).toBe(2);
        expect(event.hname).toBeDefined();
        expect(event.stateName).toBe('ready');
        expect(event.tracking?.mode).toBe(ScvdEventTrackingMode.Start);
        expect(event.print).toHaveLength(1);
    });

    it('updates nested objects via setters', () => {
        const event = new ScvdEvent(undefined);
        event.level = '1';
        event.level = '2';
        expect(event.level?.level).toBe('EventLevelOp');

        event.property = 'A';
        event.property = 'B';
        expect(event.property?.expression?.expression).toBe('B');

        event.tracking = 'Start';
        event.tracking = 'Stop';
        expect(event.tracking?.mode).toBe(ScvdEventTrackingMode.Stop);

        const state = new ScvdEventState(undefined);
        event.state = state;
        expect(event.state).toBe(state);
        event.state = undefined;
        expect(event.state).toBeUndefined();
        event.stateName = 'next';
        expect(event.stateName).toBe('next');
    });

    it('adds print items and resolves links with default behavior', () => {
        const event = new ScvdEvent(undefined);
        const printItem = event.addPrint();
        expect(event.print).toContain(printItem);
        expect(event.resolveAndLink(() => undefined)).toBe(false);
    });

    it('ignores undefined setter values', () => {
        const event = new ScvdEvent(undefined);
        event.id = undefined;
        event.level = undefined;
        event.property = undefined;
        event.value = undefined;
        event.handle = undefined;
        event.hname = undefined;
        event.tracking = undefined;
        expect(event.id).toBeUndefined();
        expect(event.level).toBeUndefined();
        expect(event.property).toBeUndefined();
        expect(event.value).toBeUndefined();
        expect(event.handle).toBeUndefined();
        expect(event.hname).toBeUndefined();
        expect(event.tracking).toBeUndefined();
    });
});
