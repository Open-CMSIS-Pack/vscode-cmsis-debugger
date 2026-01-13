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

import { ScvdComponentIdentifier } from './scvd-component-identifier';
import { ScvdEvents } from './scvd-events';
import { Json, ScvdBase } from './scvd-base';
import { ScvdObjects } from './scvd-object';
import { ScvdTypedefs } from './scvd-typedef';
import { getArrayFromJson, getObjectFromJson } from './scvd-utils';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdBreaks } from './scvd-break';

export class ScvdComponentViewer extends ScvdBase {
    private _componentIdentifier: ScvdComponentIdentifier | undefined;
    private _typedefs: ScvdTypedefs | undefined;
    private _objects: ScvdObjects | undefined;
    private _events: ScvdEvents | undefined;
    private _breaks: ScvdBreaks | undefined;

    constructor(
        parent: ScvdBase | undefined,
    ) {
        super(parent);
    }

    /* template for readXml
    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        //this.tag = xml.tag;

        return super.readXml(xml);
    }
    */

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        const componentViewer: Json = getObjectFromJson(xml.component_viewer);
        if( componentViewer === undefined) {
            return false;
        }

        const componentIdentifier: Json = getObjectFromJson(componentViewer.component);
        if(componentIdentifier !== undefined) {
            this._componentIdentifier = new ScvdComponentIdentifier(this);
            this._componentIdentifier.readXml(componentIdentifier);
        }

        const objectsContainer: Json = getObjectFromJson(componentViewer.objects);
        if(objectsContainer !== undefined) {
            this._objects = new ScvdObjects(this);
            this._objects.readXml(objectsContainer);
        }

        const typedefsContainer: Json = getObjectFromJson(componentViewer.typedefs);
        if(typedefsContainer !== undefined) {
            this._typedefs = new ScvdTypedefs(this);
            this._typedefs.readXml(typedefsContainer);
        }

        // disable for now
        /*const events = getArrayFromJson(componentViewer?.events);
        if(events !== undefined) {
            this._events = new ScvdEvents(this);
            this._events.readXml(events);
        }*/

        const allBreaks = this.collectBreakStatements(componentViewer);
        if(allBreaks.length > 0) {
            this._breaks = new ScvdBreaks(this);
            this._breaks.readXml({ break: allBreaks });
        }

        return super.readXml(xml);
    }

    public getSymbol(_name: string): ScvdBase | undefined {
        return undefined;
    }

    public get component(): ScvdComponentIdentifier | undefined {
        return this._componentIdentifier;
    }
    public get typedefs(): ScvdTypedefs | undefined {
        return this._typedefs;
    }
    public get objects(): ScvdObjects | undefined {
        return this._objects;
    }
    public get events(): ScvdEvents | undefined {
        return this._events;
    }
    public get breaks(): ScvdBreaks | undefined {
        return this._breaks;
    }

    public configureAll(): boolean {
        return this.configureRecursive(this);
    }
    private configureRecursive(item: ScvdBase): boolean {
        item.configure();
        item.children.forEach( (child: ScvdBase) => {
            this.configureRecursive(child);
        });
        return true;
    }

    public async calculateTypedefs(): Promise<boolean> {
        const typedefs = this.typedefs;
        if(typedefs === undefined || typedefs.typedef.length === 0) {
            return false;
        }
        await typedefs.calculateTypedefs();
        return true;
    }

    public validateAll(prevResult: boolean): boolean {
        this.valid = prevResult;
        return this.validateRecursive(this, prevResult);
    }
    private validateRecursive(item: ScvdBase, prevResult: boolean): boolean {
        const valid = item.validate(prevResult);
        item.children.forEach( (child: ScvdBase) => {
            this.validateRecursive(child, valid);
        });
        return valid;
    }

    public setExecutionContextAll(executionContext: ExecutionContext) {
        this.setExecutionContextRecursive(this, executionContext);
    }
    private setExecutionContextRecursive(item: ScvdBase, executionContext: ExecutionContext) {
        item.setExecutionContext(executionContext);
        item.children.forEach( (child: ScvdBase) => {
            this.setExecutionContextRecursive(child, executionContext);
        });
    }

    private collectBreakStatements(node: Json | Json[] | undefined): Json[] {
        if(node === undefined) {
            return [];
        }

        if(Array.isArray(node)) {
            const breaks: Json[] = [];
            node.forEach(item => breaks.push(...this.collectBreakStatements(item)));
            return breaks;
        }

        if(typeof node !== 'object' || node === null) {
            return [];
        }

        const breaks: Json[] = [];
        const directBreaks = getArrayFromJson(node.break);
        if(directBreaks !== undefined) {
            breaks.push(...directBreaks);
        }

        for (const [key, value] of Object.entries(node)) {
            if(key === 'break') {
                continue;   // already processed above
            }
            breaks.push(...this.collectBreakStatements(value as Json | Json[] | undefined));
        }

        return breaks;
    }
}
