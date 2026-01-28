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
    private _name: string | undefined;
    private _value: string | undefined;
    private _children: ScvdGuiTree[] = [];
    private _childIndex: Map<string, ScvdGuiTree> = new Map<string, ScvdGuiTree>();
    // Per-update counter for duplicate keys to generate stable suffixed keys (key, key#1, key#2, ...)
    private _keyCursor: Map<string, number> = new Map<string, number>();
    private _key: string | undefined;
    // Marks when this node was last visited during a reconciliation pass.
    // If the node is not seen in the current epoch it is pruned in finalizeUpdate().
    private _seenEpoch = 0;
    private _isPrint: boolean = false;
    // Monotonic counter for reconciliation passes. Increments at beginUpdate() and is compared against _seenEpoch.
    private static _epoch: number = 0;

    constructor(
        parent: ScvdGuiTree | undefined,
    ) {
        this._parent = parent;
        if (parent) {
            parent.addChild(this);
        }
    }

    public beginUpdate(): number {
        const nextEpoch = ++ScvdGuiTree._epoch;
        this.markSeen(nextEpoch);
        return nextEpoch;
    }

    public finalizeUpdate(updateEpoch: number): void {
        const survivors: ScvdGuiTree[] = [];
        for (const child of this._children) {
            if (child.seenEpoch === updateEpoch) {
                survivors.push(child);
            } else if (child.key !== undefined) {
                this._childIndex.delete(child.key);
                child._parent = undefined;
            }
        }
        this._children = survivors;
        for (const child of survivors) {
            child.finalizeUpdate(updateEpoch);
        }
    }

    private markSeen(updateEpoch: number): void {
        this.seenEpoch = updateEpoch;
        this._keyCursor = new Map<string, number>();
    }

    private bumpOrder(child: ScvdGuiTree): void {
        const index = this._children.indexOf(child);
        if (index >= 0 && index !== this._children.length - 1) {
            this._children.splice(index, 1);
            this._children.push(child);
        }
    }

    public getOrCreateChild(key: string): ScvdGuiTree {
        const updateEpoch = ScvdGuiTree.epoch;
        try {
            const index = this._keyCursor.get(key) ?? 0;
            this._keyCursor.set(key, index + 1);
            const effectiveKey = index === 0 ? key : `${key}#${index}`;

            const existing = this._childIndex.get(effectiveKey);
            if (existing) {
                existing.markSeen(updateEpoch);
                this.bumpOrder(existing);
                return existing;
            }

            const child = new ScvdGuiTree(this);
            child.key = effectiveKey;
            child.markSeen(updateEpoch);
            this._childIndex.set(effectiveKey, child);
            return child;
        } catch (err) {
            console.error(`Failed to create GUI child "${key}" under "${this.path}":`, err);
            const fallback = new ScvdGuiTree(this);
            fallback.key = `${key}#fallback`;
            fallback.markSeen(updateEpoch);
            return fallback;
        }
    }

    public get parent(): ScvdGuiTree | undefined {
        return this._parent;
    }

    public get childIndex(): ReadonlyMap<string, ScvdGuiTree> {
        return this._childIndex;
    }

    public get keyCursor(): ReadonlyMap<string, number> {
        return this._keyCursor;
    }

    public get key(): string | undefined {
        return this._key;
    }
    protected set key(value: string | undefined) {
        this._key = value;
    }

    public get seenEpoch(): number {
        return this._seenEpoch;
    }
    protected set seenEpoch(value: number) {
        this._seenEpoch = value;
    }

    public static get epoch(): number {
        return ScvdGuiTree._epoch;
    }
    public static set epoch(value: number) {
        ScvdGuiTree._epoch = value;
    }

    // Depth-first iterator from this node up through its parents (self first).
    private *ancestors(): Iterable<ScvdGuiTree> {
        yield this;
        if (this.parent) {
            yield* this.parent.ancestors();
        }
    }

    private get path(): string {
        const parts: string[] = [];
        for (const node of this.ancestors()) {
            parts.push(node.key ?? node.name ?? 'unknown');
        }
        return parts.reverse().join(' > ');
    }

    public clear(): void {
        this._children = [];
        this._childIndex.clear();
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
        if (this._key !== undefined) {
            this._parent._childIndex.delete(this._key);
        }
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
