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

jest.mock('path');
import * as os from 'os';
import * as path from 'path';
import { extractPname, getCmsisPackRootPath, isWindows } from './utils';

const CMSIS_PACK_ROOT_DEFAULT = 'mock/path';
describe('getCmsisPackRoot', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('checks if CMSIS_PACK_ROOT already exists', () => {
        const originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv, CMSIS_PACK_ROOT: CMSIS_PACK_ROOT_DEFAULT };
        const returnValue = getCmsisPackRootPath();
        expect(returnValue).toBe(CMSIS_PACK_ROOT_DEFAULT);
        process.env = originalProcessEnv;
    });

    it('checks if CMSIS_PACK_ROOT has been added or not', () => {
        const originalProcessEnv = process.env;
        delete process.env['CMSIS_PACK_ROOT'];
        const spy = jest.spyOn(path, 'join');
        getCmsisPackRootPath();
        if (isWindows) {
            expect(spy).toHaveBeenCalledWith(process.env['LOCALAPPDATA'] ?? os.homedir(), 'Arm', 'Packs');
        } else {
            expect(spy).toHaveBeenCalledWith(os.homedir(), '.cache', 'arm', 'packs');
        }
        process.env = originalProcessEnv;
    });
});

describe('extractPname', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('extracts pname if first part of string but with now pname list', () => {
        const result = extractPname('dev-ice_name01 probe@gdbserver');
        expect(result).toStrictEqual('dev-ice_name01');
    });

    it('extracts pname if first part of string and in pname list', () => {
        const result = extractPname('dev-ice_name01 probe@gdbserver', ['dev2', 'dev-ice_name01']);
        expect(result).toStrictEqual('dev-ice_name01');
    });

    it('fails to extract if pname not first part of string but in pname list', () => {
        const result = extractPname('prefix dev-ice_name01 probe@gdbserver', ['dev2', 'dev-ice_name01']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if pname first part of string but not in pname list', () => {
        const result = extractPname('dev-ice_name01 probe@gdbserver', ['dev2', 'dev-ice_name03']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if first part contains char invalid in pname', () => {
        const result = extractPname('dev-ice_*name01 probe@gdbserver', ['dev2', 'dev-ice_*name01']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if first part contains char invalid in pname and in pname list', () => {
        const result = extractPname('dev-ice_*name01 probe@gdbserver', ['dev2', 'dev-ice_*name01']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if first part contains char invalid in pname and no pname list', () => {
        const result = extractPname('dev-ice_*name01 probe@gdbserver');
        expect(result).toBeUndefined();
    });

});
