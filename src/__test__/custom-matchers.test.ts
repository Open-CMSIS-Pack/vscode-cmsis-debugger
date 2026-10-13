/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

import * as path from 'node:path';

import { isWindows } from '../utils';

describe('toEqualFsPath', () => {
    it('matches equivalent normalized filesystem paths', () => {
        const expected = path.join('workspace', 'target.ctrace.yml');
        const actual = ['workspace', 'nested', '..', 'target.ctrace.yml'].join(path.sep);

        expect(actual).toEqualFsPath(expected);
    });

    it('uses the platform filesystem case semantics', () => {
        const expected = path.join('workspace', 'Target.ctrace.yml');
        const actual = path.join('workspace', 'target.ctrace.yml');

        if (isWindows) {
            expect(actual).toEqualFsPath(expected);
        } else {
            expect(actual).not.toEqualFsPath(expected);
        }
    });

    it('rejects different paths and non-string values', () => {
        const expected = path.join('workspace', 'target.ctrace.yml');

        expect(path.join('workspace', 'other.ctrace.yml')).not.toEqualFsPath(expected);
        expect(undefined).not.toEqualFsPath(expected);
    });

    it('can match mock call arguments', () => {
        const expected = path.join('workspace', 'target.ctrace.yml');
        const actual = ['workspace', 'nested', '..', 'target.ctrace.yml'].join(path.sep);
        const callback = jest.fn();

        callback(actual);

        expect(callback).toHaveBeenLastCalledWith(expect.toEqualFsPath(expected));
    });
});
