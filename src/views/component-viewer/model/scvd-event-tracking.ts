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

import { ScvdBase } from './scvd-base';

// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html

/**
 * Specifies the tracking for an event handle.
 *  - Start: start the state tracking for an event handle.
 *  - Stop: stop the state tracking for an event handle.
 *  - Reset: initialize the tracking for all event handles of that component to "Stop".
 */
export enum ScvdEventTrackingMode {
    Start = 'Start',
    Stop = 'Stop',
    Reset = 'Reset',
}

export class ScvdEventTracking extends ScvdBase {
    private _mode: ScvdEventTrackingMode | undefined;

    constructor(
        parent: ScvdBase | undefined,
        mode: string,
    ) {
        super(parent);
        this.mode = mode;
    }

    public get mode(): ScvdEventTrackingMode | undefined {
        return this._mode;
    }

    public set mode(value: string | undefined) {
        if (value !== undefined) {
            this._mode = ScvdEventTrackingMode[value as keyof typeof ScvdEventTrackingMode];
        }
    }

}
