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

import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdComponent } from './scvd-component';
import { getArrayFromJson } from './scvd-utils';

export class ScvdGroup extends ScvdNode {
    private _component: ScvdComponent[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdGroup';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        const components = getArrayFromJson<Json>(xml.component);
        components?.forEach( (component: Json) => {
            const newComponent = this.addComponent();
            newComponent.readXml(component);
        });

        return super.readXml(xml);
    }

    public addComponent(): ScvdComponent {
        const newComponent = new ScvdComponent(this);
        this._component.push(newComponent);
        return newComponent;
    }

    public get components(): ScvdComponent[] {
        return this._component;
    }

}
