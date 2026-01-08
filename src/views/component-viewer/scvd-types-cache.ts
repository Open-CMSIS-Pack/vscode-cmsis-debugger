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

import { ScvdBase } from './model/scvd-base';
import { ScvdComponentViewer } from './model/scvd-comonent-viewer';
import { ScvdTypedef } from './model/scvd-typedef';


// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html


export class ScvdTypesCache {
    private _model: ScvdComponentViewer | undefined;
    private typesCache: Map<string, ScvdBase> = new Map<string, ScvdBase>();

    constructor(
        model: ScvdComponentViewer,
    ) {
        this.model = model;
    }

    protected getModel(): ScvdComponentViewer | undefined {
        return this._model;
    }
    private set model(value: ScvdComponentViewer | undefined) {
        this._model = value;
    }

    public createCache(): void {
        const typedefs = this.getModel()?.typedefs;
        if( typedefs === undefined ) {
            return;
        }

        typedefs.forEach( item => {
            if(!(item instanceof ScvdTypedef)) {
                return;
            }

            const name = item.name;
            if(name !== undefined) {
                this.typesCache.set(name, item);
            }
        });
    }

    public findTypeByName(name: string): ScvdTypedef | undefined {
        const typesCache = this.typesCache;
        if (typesCache === undefined) {
            return undefined;
        }
        const typeItem = typesCache.get(name);
        if (typeItem instanceof ScvdTypedef) {
            return typeItem;
        }
        return undefined;
    }
}
