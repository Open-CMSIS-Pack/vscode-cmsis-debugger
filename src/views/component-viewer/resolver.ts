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
import { ScvdComponentViewer } from './model/scvd-component-viewer';
import { ScvdTypedef } from './model/scvd-typedef';
import { ScvdTypesCache } from './scvd-types-cache';

// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html


export enum ResolveType {
    localType = 'localType',
    localMember = 'localMember',
    targetType = 'targetType',
}

export type ResolveSymbolCb = (
  name: string,
  resolveType: ResolveType,
  scvdObject?: ScvdBase
) => ScvdBase | undefined;

export class Resolver {
    private _model: ScvdComponentViewer | undefined;
    private _typesCache: ScvdTypesCache | undefined;

    constructor(
        model: ScvdComponentViewer,
    ) {
        this.model = model;
    }

    protected get model(): ScvdComponentViewer | undefined {
        return this._model;
    }
    private set model(value: ScvdComponentViewer | undefined) {
        this._model = value;
    }

    public get typesCache(): ScvdTypesCache | undefined {
        return this._typesCache;
    }

    private createTypesCache() {
        if(this.model === undefined) {
            return;
        }
        this._typesCache = new ScvdTypesCache(this.model);
        this._typesCache.createCache();
    }

    private resolveLocalType(name: string): ScvdBase | undefined {
        const typeItem = this.typesCache?.findTypeByName(name);
        if(typeItem !== undefined && typeItem instanceof ScvdTypedef) {
            return typeItem;
        }
        return undefined;
    }

    private resolveLocalMember(name: string, scvdObject?: ScvdBase): ScvdBase | undefined {
        if(scvdObject === undefined) {
            return undefined;
        }
        const memberItem = scvdObject.getSymbol(name);
        if(memberItem !== undefined) {
            return memberItem;
        }
        return undefined;
    }

    private resolveTargetType(_name: string): ScvdBase | undefined {
        // resolve using debugger interface
        console.log(`  Resolving target symbol: ${_name}`);
        return undefined;
    }

    public resolveSymbolCb(
        name: string,
        resolveType: ResolveType,
        scvdObject?: ScvdBase
    ): ScvdBase | undefined {
        switch(resolveType) {
            case ResolveType.localType:
                return this.resolveLocalType(name);
            case ResolveType.targetType:
                return this.resolveTargetType(name);
            case ResolveType.localMember:
                return this.resolveLocalMember(name, scvdObject);
            default:
                return undefined;
        }
    }

    private resolveRecursive(item: ScvdBase, resolveFunc: ResolveSymbolCb): boolean {
        /*const resolvedItem =*/ item.resolveAndLink(resolveFunc);
        // if(resolvedItem) {
        //     console.log('Resolved item:', item.getDisplayLabel());
        // }

        item.forEach(child => {
            this.resolveRecursive(child, resolveFunc);
        });

        return true;
    }

    private resolveTypes(): boolean {
        const model = this.model;
        const typesCache = this.typesCache;
        if (model === undefined || typesCache === undefined) {
            return false;
        }

        this.resolveRecursive(model, this.resolveSymbolCb.bind(this));

        return true;
    }

    public resolve(): boolean {
        const model = this.model;
        if( model === undefined) {
            return false;
        }

        this.createTypesCache();
        this.resolveTypes();

        return true;
    }
}
