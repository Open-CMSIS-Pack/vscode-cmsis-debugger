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

import type { ScvdMember } from './scvd-member';
import type { ScvdNode } from './scvd-node';
import type { ScvdVar } from './scvd-var';

export class ScvdTypedefFieldCache {
    private fieldByName = new Map<string, ScvdNode>();

    public get(name: string): ScvdNode | undefined {
        return this.fieldByName.get(name);
    }

    public set(name: string, node: ScvdNode): void {
        this.fieldByName.set(name, node);
    }

    public clear(): void {
        this.fieldByName.clear();
    }

    public rebuild(members: ScvdMember[], vars: ScvdVar[]): void {
        this.fieldByName.clear();
        for (const field of [...members, ...vars]) {
            if (field.name !== undefined) {
                this.fieldByName.set(field.name, field);
            }
        }
    }
}
