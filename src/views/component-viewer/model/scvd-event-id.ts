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

// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html

import { ScvdNode } from './scvd-node';
import { ScvdExpression } from './scvd-expression';

export class ScvdEventId extends ScvdNode {
    private _id: ScvdExpression;
    private _messageNumber: number | undefined;
    private _componentNumber: number | undefined;
    private _level: number | undefined;

    constructor(
        parent: ScvdNode | undefined,
        id: string,
    ) {
        super(parent);
        this._id = new ScvdExpression(this, id, 'id');
    }

    public override get classname(): string {
        return 'ScvdEventId';
    }

    public get id(): ScvdExpression {
        return this._id;
    }

    public get messageNumber(): number | undefined {
        return this._messageNumber;
    }

    public get componentNumber(): number | undefined {
        return this._componentNumber;
    }

    public get level(): number | undefined {
        return this._level;
    }

    public override configure(): boolean {
        const id = this._id;
        if (id !== undefined ) {
            id.configure();
            const constValue = id.expressionAst?.constValue;
            if (typeof constValue === 'number') {
                this._messageNumber = constValue & 0xFF;
                this._componentNumber = (constValue >> 8) & 0xFF;
                this._level = (constValue >> 16) & 0x3;
            }
        }

        return super.configure();
    }
}
