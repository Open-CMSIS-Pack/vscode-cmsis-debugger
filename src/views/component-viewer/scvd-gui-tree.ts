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

import { ScvdGuiInterface } from './model/scvd-gui-interface';

export class ScvdGuiTree implements ScvdGuiInterface {
    private _parent: ScvdGuiTree | undefined;
    private _nodeId: string;
    private _name: string | undefined;
    private _value: string | undefined;
    private _children: ScvdGuiTree[] = [];
    private _isPrint: boolean = false;
    private static idCnt: number = 0;

    constructor(
        parent: ScvdGuiTree | undefined,
    ) {
        this._parent = parent;
        if (parent) {
            parent.addChild(this);
        }
        this._nodeId = ScvdGuiTree.idCnt.toString();
        ScvdGuiTree.idCnt++;
    }

    public get parent(): ScvdGuiTree | undefined {
        return this._parent;
    }

    public get classname(): string {
        return this.constructor.name;
    }

    public get nodeId(): string {
        return this.classname + '_' + this._nodeId.toString();
    }

    public clear(): void {
        this._children = [];
    }

    public get isPrint(): boolean {
        return this._isPrint;
    }
    public set isPrint(value: boolean) {
        this._isPrint = value;
    }

    private set name(value: string | undefined) {
        this._name = value;
    }
    public get name(): string | undefined {
        return this._name;
    }

    public get value(): string | undefined {
        return this._value;
    }

    public get children(): ScvdGuiTree[] {
        return this._children;
    }

    protected addChild(child: ScvdGuiTree): void {
        this._children.push(child);
    }

    public detach(): void {
        if (!this._parent) {
            return;
        }
        this._parent._children = this._parent._children.filter(child => child !== this);
        this._parent = undefined;
    }

    public setGuiName(value: string | undefined) {
        this._name = value;
    }

    public setGuiValue(value: string | undefined) {
        this._value = value;
    }

    // --------  ScvdGuiInterface methods --------
    public getGuiEntry(): { name: string | undefined; value: string | undefined } {
        return { name: this._name, value: this._value };
    }

    public getGuiChildren(): ScvdGuiInterface[] {
        return this.children;
    }

    public getGuiName(): string | undefined {
        return this.name;
    }

    public getGuiValue(): string | undefined {
        return this.value;
    }

    public getGuiConditionResult(): boolean {
        return true;
    }

    public getGuiLineInfo(): string | undefined {
        return undefined;
    }

    public hasGuiChildren(): boolean {
        return this._children.length > 0;
    }
    // --------  ScvdGuiInterface methods --------


}
