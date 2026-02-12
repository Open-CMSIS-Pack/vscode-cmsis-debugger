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
// generated with AI

/**
 * Unit test for ScvdDataType.
 */

import { ScvdComplexDataType, ScvdDataType, ScvdScalarDataType } from '../../../model/scvd-data-type';
import { ScvdNode } from '../../../model/scvd-node';
import { ScvdTypedef } from '../../../model/scvd-typedef';

class DummyTypedef extends ScvdTypedef {
    constructor() {
        super(undefined);
    }

    public override getTypeSize(): number | undefined {
        return 8;
    }

    public override async getVirtualSize(): Promise<number | undefined> {
        return 12;
    }

    public override async getTargetSize(): Promise<number | undefined> {
        return 16;
    }

    public override getMember(_property: string): ScvdNode | undefined {
        return this;
    }
}

describe('ScvdDataType', () => {
    it('handles scalar and pointer scalar types', async () => {
        const scalar = new ScvdDataType(undefined, 'uint32_t');
        expect(scalar.type).toBeInstanceOf(ScvdScalarDataType);
        expect(scalar.getTypeSize()).toBe(4);
        await expect(scalar.getVirtualSize()).resolves.toBe(4);
        expect(scalar.getIsPointer()).toBe(false);
        expect(scalar.getValueType()).toBe('uint32_t');
        expect(scalar.getMember('anything')).toBeUndefined();

        const float = new ScvdDataType(undefined, 'double');
        expect(float.getValueType()).toBe('double');

        const pointer = new ScvdDataType(undefined, '*uint16_t');
        expect(pointer.getIsPointer()).toBe(true);
        expect(pointer.getValueType()).toBe('uint32_t');
    });

    it('creates complex data types for custom names', () => {
        const complex = new ScvdDataType(undefined, 'CustomType');
        expect(complex.type).toBeInstanceOf(ScvdComplexDataType);
        expect(complex.getIsPointer()).toBe(false);
        expect(complex.getValueType()).toBeUndefined();
    });

    it('handles unknown scalar types without size info', async () => {
        const scalar = new ScvdScalarDataType(undefined, 'unknown_t');
        expect(scalar.type).toBeUndefined();
        expect(scalar.getTypeSize()).toBeUndefined();
        await expect(scalar.getVirtualSize()).resolves.toBeUndefined();
    });

    it('returns defaults when no type is provided', () => {
        const dataType = new ScvdDataType(undefined, undefined);
        expect(dataType.type).toBeUndefined();
        expect(dataType.getIsPointer()).toBe(false);
        expect(dataType.getValueType()).toBeUndefined();

        const scalar = new ScvdScalarDataType(undefined, undefined);
        expect(scalar.type).toBeUndefined();
        expect(scalar.getIsPointer()).toBe(false);
    });

    it('fails to resolve complex types when no symbol is found', async () => {
        const missing = new ScvdComplexDataType(undefined, 'MissingType');
        const resolved = missing.resolveAndLink(() => undefined);
        expect(resolved).toBe(false);
        expect(missing.getTypeSize()).toBeUndefined();
        await expect(missing.getVirtualSize()).resolves.toBeUndefined();

        const noName = new ScvdComplexDataType(undefined, undefined);
        expect(noName.resolveAndLink(() => undefined)).toBe(false);
    });

    it('resolves complex types and reflects pointer semantics', async () => {
        const typedef = new DummyTypedef();
        const complex = new ScvdComplexDataType(undefined, '*MyType');
        const ok = complex.resolveAndLink((name) => {
            if (name === 'MyType') {
                return typedef;
            }
            return undefined;
        });
        expect(ok).toBe(true);
        expect(complex.getIsPointer()).toBe(true);
        expect(complex.getTypeSize()).toBe(8);
        await expect(complex.getTargetSize()).resolves.toBe(16);
        await expect(complex.getVirtualSize()).resolves.toBe(12);
        expect(complex.getMember('member')).toBe(typedef);

        const dataType = new ScvdDataType(undefined, '*MyType');
        const inner = dataType.type as ScvdComplexDataType;
        inner.resolveAndLink((name) => (name === 'MyType' ? typedef : undefined));
        expect(dataType.getValueType()).toBe('uint32_t');
    });

    it('returns cached members for data types', () => {
        const typedef = new DummyTypedef();
        const dataType = new ScvdDataType(undefined, 'MyType');
        const inner = dataType.type as ScvdComplexDataType;
        inner.resolveAndLink((name) => (name === 'MyType' ? typedef : undefined));

        expect(dataType.getMember('field')).toBe(typedef);
        expect(dataType.getMember('field')).toBe(typedef);

        const complex = new ScvdComplexDataType(undefined, 'MyType');
        complex.resolveAndLink((name) => (name === 'MyType' ? typedef : undefined));
        expect(complex.getMember('field')).toBe(typedef);
        expect(complex.getMember('field')).toBe(typedef);
    });

    it('exposes classnames and target sizes', async () => {
        const dataType = new ScvdDataType(undefined, 'uint16_t');
        expect(dataType.classname).toBe('ScvdDataType');
        await expect(dataType.getTargetSize()).resolves.toBe(2);

        const scalar = new ScvdScalarDataType(undefined, 'uint8_t');
        expect(scalar.classname).toBe('ScvdScalarDataType');

        const complex = new ScvdComplexDataType(undefined, 'MyType');
        expect(complex.classname).toBe('ScvdComplexDataType');
    });
});
