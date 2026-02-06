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

import { ExecutionContext } from '../scvd-eval-context';
import { ScvdNode } from './scvd-node';
import { MemberInfo } from '../scvd-debug-target';

export class ScvdSymbol extends ScvdNode {
    private _symbol: string | undefined;
    private _address: number | undefined;
    private _memberInfo: MemberInfo[] = [];

    constructor(
        parent: ScvdNode | undefined,
        value: string,
    ) {
        super(parent);
        this.symbol = value;
    }

    public override get classname(): string {
        return 'ScvdSymbol';
    }

    public get symbol(): string | undefined {
        return this._symbol;
    }
    public set symbol(value: string | undefined) {
        this._symbol = value;
    }

    public get address(): number | undefined {
        return this._address;
    }
    public set address(value: number | undefined) {
        this._address = value;
    }

    public get memberInfo(): MemberInfo[] {
        return this._memberInfo;
    }
    private addMemberInfo(name: string, size: number, offset: number) {
        this._memberInfo.push({ name: name, size: size, offset: offset });
    }

    public async fetchSymbolInformation(): Promise<boolean> {
        if (this.symbol === undefined || this._executionContext === undefined) {
            return false;
        }

        const symbolInfo = await this._executionContext.debugTarget.getSymbolInfo(this.symbol);
        if (symbolInfo !== undefined) {
            this.address = symbolInfo.address;
            symbolInfo.member?.forEach(member => {
                this.addMemberInfo(member.name, member.size, member.offset);
            });
        }

        return true;
    }

    public getOffset(name: string | undefined): number | undefined {
        if (name === undefined || this.memberInfo === undefined) {
            return undefined;
        }

        const memberInfo = this.memberInfo.find(member => member.name === name);
        return memberInfo?.offset;
    }

    public override setExecutionContext(executionContext: ExecutionContext) {
        super.setExecutionContext(executionContext);
    }


}
