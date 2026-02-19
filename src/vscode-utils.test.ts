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

import {
    vscodeViewExists
} from './vscode-utils';

describe('vscodeViewExists', () => {
    // See _mocks_/vscode.ts for registered commands.

    it('returns true if a view and its commands exist', async () => {
        const result = await vscodeViewExists('liveWatch');
        expect(result).toBe(true);
    });

    it('returns false if a view and its commands do not exist', async () => {
        const result = await vscodeViewExists('missingView');
        expect(result).toBe(false);
    });
});
