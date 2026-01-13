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

// https://arm-software.github.io/CMSIS-View/main/er_theory.html

import { ScvdBase } from './scvd-base';

export class ScvdComponentNumber extends ScvdBase {
    private _componentNumber: number | undefined;

    public get componentNumber(): number | undefined {
        return this._componentNumber;
    }

    public set componentNumber(value: number | undefined) {
        this._componentNumber = value;
    }

    constructor(
        parent: ScvdBase | undefined,
    ) {
        super(parent);
    }

    public getComponentRange(value: number): string | undefined {
        if (value < 0 || value > 0xFF) {
            return undefined;
        }
        if (value <= 0x3F) {
            return 'User application software component';
        }
        if (value <= 0x7F) {
            return 'Third party middleware component';
        }
        if (value <= 0xED) {
            return 'MDK-Middleware component';
        }
        switch (value) {
            case 0xEE:
                return 'Fault component';
            case 0xEF:
                return 'Event statistics start/stop';
            case 0xF0:
            case 0xF1:
            case 0xF2:
            case 0xF3:
            case 0xF4:
            case 0xF5:
            case 0xF6:
            case 0xF7:
            case 0xF8:
            case 0xF9:
            case 0xFA:
            case 0xFB:
            case 0xFC:
                return 'RTOS kernel';
            case 0xFD:
                return 'Inter-process communication layer';
            case 0xFE:
                return 'printf-style debug output';
            case 0xFF:
                return 'Event Recorder message';
            default:
                return undefined;
        }
    }



}
