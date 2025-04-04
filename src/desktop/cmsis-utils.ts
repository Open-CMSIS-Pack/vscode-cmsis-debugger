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


import * as os from 'os';
import * as path from 'path';

export const getCmsisPackRootPath = (): string|undefined => {
    const environmentValue = process.env['CMSIS_PACK_ROOT'];
    if (environmentValue) {
        return environmentValue;
    }

    const cmsisPackRootDefault = os.platform() === 'win32'
        ? path.join(process.env['LOCALAPPDATA'] ?? os.homedir(), 'Arm', 'Packs')
        : path.join(os.homedir(), '.cache', 'arm', 'packs');

    return cmsisPackRootDefault;
};
