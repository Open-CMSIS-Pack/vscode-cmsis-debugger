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
    private _id: string | undefined;
    private _name: string | undefined;
    private _value: string | undefined;
    private _lineInfo: string | undefined;
    private _children: ScvdGuiTree[] = [];
    private _isPrint = false;
    private _idCursor: Map<string, number> = new Map<string, number>();
    private _childrenByKey: Map<string, ScvdGuiTree> = new Map<string, ScvdGuiTree>();

    constructor(parent: ScvdGuiTree | undefined) {
        this._parent = parent;
        if (parent) {
            parent.addChild(this);
        }
    }

    public getOrCreateChild(key: string, idSegmentBase?: string): ScvdGuiTree {
        const segmentBase = idSegmentBase ?? key;
        const childKey = `${segmentBase}::${key}`;
        const existing = this._childrenByKey.get(childKey);
        if (existing) {
            return existing;
        }
        const child = new ScvdGuiTree(this);
        const segment = this.nextIdSegment(segmentBase);
        child.setId(this.buildChildId(segment));
        this._childrenByKey.set(childKey, child);
        return child;
    }

    private nextIdSegment(segmentBase: string): string {
        const nextIndex = this._idCursor.get(segmentBase) ?? 0;
        this._idCursor.set(segmentBase, nextIndex + 1);
        return nextIndex === 0 ? segmentBase : `${segmentBase}-${nextIndex}`;
    }

    private buildChildId(segment: string): string {
        return this._id ? `${this._id}/${segment}` : segment;
    }

    public get parent(): ScvdGuiTree | undefined {
        return this._parent;
    }

    public getGuiId(): string | undefined {
        return this._id;
    }

    public setId(value: string | undefined): void {
        this._id = value;
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

    public clear(): void {
        this._children = [];
        this._idCursor.clear();
        this._childrenByKey.clear();
    }

    public detach(): void {
        if (!this._parent) {
            return;
        }
        this._parent._children = this._parent._children.filter(child => child !== this);
        for (const [key, child] of this._parent._childrenByKey.entries()) {
            if (child === this) {
                this._parent._childrenByKey.delete(key);
            }
        }
        this._parent = undefined;
    }

    public setGuiName(value: string | undefined) {
        this._name = value;
    }

    public setGuiValue(value: string | undefined) {
        this._value = value;
    }

    public setGuiLineInfo(value: string | undefined) {
        this._lineInfo = value;
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
        return this._lineInfo;
    }

    public hasGuiChildren(): boolean {
        return this._children.length > 0;
    }
    // --------  ScvdGuiInterface methods --------
}
