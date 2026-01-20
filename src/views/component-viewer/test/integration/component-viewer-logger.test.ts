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
 *
 * Integration test for ComponentViewerLogger.
 */
// generated with AI


jest.mock('vscode', () => {
    const mockChannel = { appendLine: jest.fn(), dispose: jest.fn() };
    const createOutputChannel = jest.fn(() => mockChannel);
    return {
        window: { createOutputChannel },
        __mock: { createOutputChannel, mockChannel },
    };
});

jest.mock('../../../../manifest', () => ({
    COMPONENT_VIEWER_DISPLAY_NAME: 'Component Viewer',
}));

describe('component-viewer-logger', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('creates a logger output channel with log option', async () => {
        const { __mock } = jest.requireMock('vscode') as { __mock: { createOutputChannel: jest.Mock; mockChannel: unknown } };
        const { componentViewerLogger } = await import('../../component-viewer-logger');
        expect(__mock.createOutputChannel).toHaveBeenCalledWith('Component Viewer', { log: true });
        expect(componentViewerLogger).toBe(__mock.mockChannel);
    });
});
