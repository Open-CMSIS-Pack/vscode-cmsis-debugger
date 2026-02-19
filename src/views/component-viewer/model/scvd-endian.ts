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

export class ScvdEndian extends ScvdNode {
    private _endian: string;
    private readonly endianValues = ['L', 'B']; // L for little-endian, B for big-endian
    private _isBigEndian: boolean = false;

    constructor(
        parent: ScvdNode | undefined,
        endian: string = 'L' // default is little-endian
    ) {
        super(parent);
        this._endian = endian;
        this._isBigEndian = this.endianValues.includes(endian) && endian === 'B';
    }

    public override get classname(): string {
        return 'ScvdEndian';
    }

    public set endian(value: string) {
        this._endian = value;
        this._isBigEndian = this.endianValues.includes(value) && value === 'B';
        this.isModified = true;
    }
    public get endian(): string {
        return this._endian;
    }

    public get isBigEndian(): boolean {
        return this._isBigEndian;
    }

    public convertToBigEndian(value: number): number {
        if (this._isBigEndian) {
            // Convert to big-endian representation
            return parseInt(value.toString(16).match(/.{1,2}/g)?.reverse().join('') || '0', 16);
        }
        return value; // No conversion needed for little-endian
    }

}
