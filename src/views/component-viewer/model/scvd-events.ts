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

//

import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdEvent } from './scvd-event';
import { ScvdGroup } from './scvd-group';
import { getArrayFromJson } from './scvd-utils';

export class ScvdEvents extends ScvdNode {
    private _event: ScvdEvent[] = [];
    private _group: ScvdGroup[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdEvents';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        const events = getArrayFromJson<Json>(xml);
        events?.forEach( (v: Json) => {
            const event = getArrayFromJson<Json>(v.event);
            event?.forEach( (v: Json) => {
                const item = this.addEvent();
                item.readXml(v);
            });

            const groups = getArrayFromJson<Json>(v.group);
            groups?.forEach( (v: Json) => {
                const item = this.addGroup();
                item.readXml(v);
            });
        });

        return super.readXml(xml);
    }

    public get event(): ScvdEvent[] {
        return this._event;
    }

    public addEvent(): ScvdEvent {
        const event = new ScvdEvent(this);
        this._event.push(event);
        return event;
    }

    public get group(): ScvdGroup[] {
        return this._group;
    }
    public addGroup(): ScvdGroup {
        const group = new ScvdGroup(this);
        this._group.push(group);
        return group;
    }

}
