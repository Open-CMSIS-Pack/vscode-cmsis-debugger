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
 *
 * Unit test for ScvdRegisterAccess.
 */

import { ScvdRegisterAccess } from '../../../model/scvd-register-access';
import { ScvdNode } from '../../../model/scvd-node';

class TestParent extends ScvdNode {
    constructor() {
        super(undefined);
    }
}

describe('ScvdRegisterAccess coverage', () => {
    it('constructs with an optional parent', () => {
        const access = new ScvdRegisterAccess(undefined);
        expect(access.classname).toBe('ScvdRegisterAccess');
        expect(access.nodeId.length).toBeGreaterThan(0);
    });

    it('links parent/child relationships when provided', () => {
        const parent = new TestParent();
        const access = new ScvdRegisterAccess(parent);
        expect(access.parent).toBe(parent);
        expect(parent.children).toContain(access);
    });
});
