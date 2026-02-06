/**
 * Copyright 2026 Arm Limited
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

import type { ScvdGuiInterface } from './model/scvd-gui-interface';

export interface GuiInstanceLockHandle {
    readonly locked: boolean;
    toggleLock(): void;
}

export class GuiInstanceRoot implements ScvdGuiInterface {
    private readonly _root: ScvdGuiInterface;
    private readonly _lockHandle: GuiInstanceLockHandle;

    public constructor(root: ScvdGuiInterface, lockHandle: GuiInstanceLockHandle) {
        this._root = root;
        this._lockHandle = lockHandle;
    }

    public isLocked(): boolean {
        return this._lockHandle.locked;
    }

    public toggleLock(): void {
        this._lockHandle.toggleLock();
    }

    public getGuiEntry(): { name: string | undefined; value: string | undefined } {
        return this._root.getGuiEntry();
    }

    public getGuiChildren(): ScvdGuiInterface[] {
        return this._root.getGuiChildren();
    }

    public getGuiName(): string | undefined {
        return this._root.getGuiName();
    }

    public getGuiValue(): string | undefined {
        return this._root.getGuiValue();
    }

    public getGuiId(): string | undefined {
        return this._root.getGuiId();
    }

    public getGuiConditionResult(): boolean {
        return this._root.getGuiConditionResult();
    }

    public getGuiLineInfo(): string | undefined {
        return this._root.getGuiLineInfo();
    }

    public hasGuiChildren(): boolean {
        return this._root.hasGuiChildren();
    }
}
