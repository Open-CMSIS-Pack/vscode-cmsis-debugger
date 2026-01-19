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

import { componentViewerLogger } from '../component-viewer-logger';

const mockChannel = { appendLine: jest.fn(), dispose: jest.fn() };
const createOutputChannel = jest.fn(() => mockChannel);

jest.mock('vscode', () => ({
    window: { createOutputChannel },
}));

jest.mock('../../../manifest', () => ({
    COMPONENT_VIEWER_DISPLAY_NAME: 'Component Viewer',
}));

describe('component-viewer-logger', () => {
    it('creates a logger output channel with log option', () => {
        expect(createOutputChannel).toHaveBeenCalledWith('Component Viewer', { log: true });
        expect(componentViewerLogger).toBe(mockChannel);
    });
});
