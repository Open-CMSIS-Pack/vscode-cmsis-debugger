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

/**
 * OutputEventFilterSet - Defines a set of categories and messages that can apply together.
 *
 * Possible categories for `gdbtarget` debug adapter type:
 *     'stdout' : GDB console stream
 *     'stderr' : GDB stderr stream
 *     'log' : GDB log stream
 */
interface OutputEventFilterSet {
    categories: string[];
    messages: RegExp[];
}

/**
 * OutputEventFilter - Class to filter out specific output events based on
 * active filter sets.
 *
 * Note: Not configurable at this time, extend constructor if more flexibility needed in future.
 *
 */
export class OutputEventFilter {
    private filterSets: OutputEventFilterSet[];

    constructor() {
        this.filterSets = [
            {
                // GDB warnings seen for (valid!!) DWARF 5 output where debug range
                // addresses are assumed to be always code addresses.
                categories: ['log'],
                messages: [
                    /warning: \(Internal error: pc 0x[0-9A-Fa-f]+ in read in CU, but not in symtab\.\)/,
                    /warning: \(Error: pc 0x[0-9A-Fa-f]+ in address map, but not in symtab\.\)/,
                ]
            }
        ];
    }

    /**
     * Filters output event by specified filter sets.
     *
     * @param event The output event to process in the filter.
     * @returns True if the event is to be discarded, false otherwise.
     */
    public filterOutputEvent(event: DebugProtocol.OutputEvent): boolean {
        return this.filterSets.some(set => {
            if (!set.categories.includes(event.body.category ?? '')) {
                return false;
            }
            return set.messages.some(message => message.test(event.body.output));
        });
    }
}
