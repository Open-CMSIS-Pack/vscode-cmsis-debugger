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

import './tree-table.css';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { TreeTable } from './TreeTable';
import type { VsCodeApi } from './TreeTable';

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi must be called exactly once per webview lifetime.
const vscodeApi = acquireVsCodeApi();

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <TreeTable vscodeApi={vscodeApi} />
        </React.StrictMode>
    );
}
