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

import { ScvdBreak, ScvdBreaks } from '../../../model/scvd-break';
import { ScvdCalc } from '../../../model/scvd-calc';
import { ScvdComponentIdentifier } from '../../../model/scvd-component-identifier';
import { ScvdComponentNumber } from '../../../model/scvd-component-number';
import { ScvdComponentViewer } from '../../../model/scvd-component-viewer';
import { ScvdComponent } from '../../../model/scvd-component';
import { ScvdCondition } from '../../../model/scvd-condition';
import { ScvdEndian } from '../../../model/scvd-endian';
import { ScvdEnum } from '../../../model/scvd-enum';
import { ScvdEventId } from '../../../model/scvd-event-id';
import { ScvdEventLevel } from '../../../model/scvd-event-level';
import { ScvdEventState } from '../../../model/scvd-event-state';
import { ScvdEvent } from '../../../model/scvd-event';
import { ScvdEvents } from '../../../model/scvd-events';
import { ScvdExpression } from '../../../model/scvd-expression';
import { ScvdGroup } from '../../../model/scvd-group';
import { ScvdItem } from '../../../model/scvd-item';
import { ScvdListOut } from '../../../model/scvd-list-out';
import { ScvdList } from '../../../model/scvd-list';
import { ScvdObject, ScvdObjects } from '../../../model/scvd-object';
import { ScvdOut } from '../../../model/scvd-out';
import { ScvdPrint } from '../../../model/scvd-print';
import { ScvdReadList } from '../../../model/scvd-readlist';
import { ScvdSymbol } from '../../../model/scvd-symbol';
import { ScvdTypedef, ScvdTypedefs } from '../../../model/scvd-typedef';
import { ScvdValueOutput } from '../../../model/scvd-value-output';

describe('Scvd model classnames', () => {
    it('exposes expected classnames', () => {
        const cases: Array<[string, { classname: string }]> = [
            ['ScvdBreaks', new ScvdBreaks(undefined)],
            ['ScvdBreak', new ScvdBreak(undefined)],
            ['ScvdCalc', new ScvdCalc(undefined)],
            ['ScvdComponentIdentifier', new ScvdComponentIdentifier(undefined)],
            ['ScvdComponentNumber', new ScvdComponentNumber(undefined)],
            ['ScvdComponentViewer', new ScvdComponentViewer(undefined)],
            ['ScvdComponent', new ScvdComponent(undefined)],
            ['ScvdCondition', new ScvdCondition(undefined, '1')],
            ['ScvdEndian', new ScvdEndian(undefined)],
            ['ScvdEnum', new ScvdEnum(undefined, undefined)],
            ['ScvdEventId', new ScvdEventId(undefined, '1')],
            ['ScvdEventLevel', new ScvdEventLevel(undefined, 'Error')],
            ['ScvdEventState', new ScvdEventState(undefined)],
            ['ScvdEvent', new ScvdEvent(undefined)],
            ['ScvdEvents', new ScvdEvents(undefined)],
            ['ScvdExpression', new ScvdExpression(undefined, '1', 'expr')],
            ['ScvdGroup', new ScvdGroup(undefined)],
            ['ScvdItem', new ScvdItem(undefined, '1', '1', '1')],
            ['ScvdListOut', new ScvdListOut(undefined)],
            ['ScvdList', new ScvdList(undefined)],
            ['ScvdObjects', new ScvdObjects(undefined)],
            ['ScvdObject', new ScvdObject(undefined)],
            ['ScvdOut', new ScvdOut(undefined)],
            ['ScvdPrint', new ScvdPrint(undefined)],
            ['ScvdReadList', new ScvdReadList(undefined)],
            ['ScvdSymbol', new ScvdSymbol(undefined, 'sym')],
            ['ScvdTypedefs', new ScvdTypedefs(undefined)],
            ['ScvdTypedef', new ScvdTypedef(undefined)],
            ['ScvdValueOutput', new ScvdValueOutput(undefined, '1', 'value')],
        ];

        for (const [expected, instance] of cases) {
            expect(instance.classname).toBe(expected);
        }
    });
});
