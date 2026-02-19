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

import { DebugProtocol } from '@vscode/debugprotocol';
import { OutputEventFilter } from './output-event-filter';

const makeOutputEvent = (output: string, category: string|undefined): DebugProtocol.OutputEvent => {
    const event = {
        seq: 1,
        type: 'event',
        event: 'output',
        body: {
            output
        }
    };
    if (category) {
        Object.assign(event.body, { category });
    }
    return event;
};

describe('OutputEventFilter', () => {
    let eventFilter: OutputEventFilter;

    beforeEach(() => {
        eventFilter = new OutputEventFilter();
    });

    it('filters events correctly', () => {
        const events = [
            makeOutputEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', 'log'),
            makeOutputEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\r\n', 'log'),
            makeOutputEvent('warning: (Error: pc 0x12345678 in address map, but not in symtab.)\n', 'log'),
        ];
        events.forEach(event => expect(eventFilter.filterOutputEvent(event)).toBe(true));
    });

    it('does not filter events with unexpected category', () => {
        const events = [
            makeOutputEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', 'stdout'),
            makeOutputEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', 'stderr'),
            makeOutputEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', 'console'),
            makeOutputEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', undefined),
        ];
        events.forEach(event => expect(eventFilter.filterOutputEvent(event)).toBe(false));
    });

    it('does not filter events that do not match the regular expressions', () => {
        const events = [
            makeOutputEvent('foo', 'log'),
            makeOutputEvent('warning: Internal error: pc 0x12345678 in read in CU, but not in symtab.\n', 'log'),
            makeOutputEvent('Internal error: pc 0x12345678 in read in CU, but not in symtab.', 'log'),
            makeOutputEvent('warning: (Internal error: pc in read in CU, but not in symtab.)\n', 'log'),
        ];
        events.forEach(event => expect(eventFilter.filterOutputEvent(event)).toBe(false));
    });
});
