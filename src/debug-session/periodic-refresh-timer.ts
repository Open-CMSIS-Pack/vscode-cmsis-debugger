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

import * as vscode from 'vscode';

const DEFAULT_REFRESH_INTERVAL = 500;

export class PeriodicRefreshTimer<T> {
    private _enabled: boolean = false;
    private _timer: NodeJS.Timeout|undefined;

    private readonly _onRefresh: vscode.EventEmitter<T> = new vscode.EventEmitter<T>();
    public readonly onRefresh: vscode.Event<T> = this._onRefresh.event;

    public get enabled(): boolean {
        return this._enabled;
    }

    public set enabled(value: boolean) {
        this._enabled = value;
        if (!value) {
            this.stop();
        }
    }

    constructor(public session: T, public interval: number = DEFAULT_REFRESH_INTERVAL) {
    }

    public start(): void {
        this.stop();
        if (!this._enabled) {
            return;
        }
        const doPeriodicRefresh = () => {
            this._onRefresh.fire(this.session);
            this._timer = setTimeout(doPeriodicRefresh, this.interval);
        };
        this._timer = setTimeout(doPeriodicRefresh, this.interval);
    }

    public stop(): void {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }
    }
}
