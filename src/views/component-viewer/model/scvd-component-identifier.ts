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

// /component_viewer/component
// https://arm-software.github.io/CMSIS-View/main/elem_component.html

import { Json, ScvdBase } from './scvd-base';
import { getStringFromJson } from './scvd-utils';

export class ScvdComponentIdentifier extends ScvdBase {
    private _version: string | undefined;
    private _shortName: string | undefined;

    constructor(
        parent: ScvdBase | undefined,
    ) {
        super(parent);
    }

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.version = getStringFromJson(xml.version);
        this.shortName = getStringFromJson(xml.shortname);

        return super.readXml(xml);
    }

    public get version(): string | undefined {
        return this._version;
    }
    public set version(version: string | undefined) {
        this._version = version;
    }

    public get shortName(): string | undefined {
        return this._shortName;
    }
    public set shortName(name: string | undefined) {
        this._shortName = name;
    }

}
