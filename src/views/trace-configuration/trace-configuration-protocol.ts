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

export type TraceControlKind = 'none' | 'text' | 'checkbox' | 'select' | 'multi-select' | 'readonly';

export interface TraceConfigurationRow {
    id: string;
    label: string;
    path: (string | number)[];
    depth: number;
    kind: 'map' | 'sequence' | 'scalar';
    control: TraceControlKind;
    value?: string | undefined;
    checked?: boolean | undefined;
    options?: string[] | undefined;
    selectedOptions?: string[] | undefined;
    hasChildren: boolean;
    expanded: boolean;
    removable: boolean;
    addChildKind?: 'data' | 'start' | 'stop' | 'generic-map' | 'generic-scalar' | undefined;
    description?: string | undefined;
}

export interface TraceConfigurationState {
    fileName?: string | undefined;
    rows: TraceConfigurationRow[];
    loading: boolean;
    dirty: boolean;
    emptyMessage?: string | undefined;
    errorMessage?: string | undefined;
}

export interface TraceReadyMessage {
    type: 'ready';
}

export interface TraceRefreshMessage {
    type: 'refresh';
}

export interface TraceSaveMessage {
    type: 'save';
}

export interface TraceOpenFileMessage {
    type: 'openFile';
}

export interface TraceToggleMessage {
    type: 'toggle';
    id: string;
    expanded: boolean;
}

export interface TraceUpdateValueMessage {
    type: 'updateValue';
    path: (string | number)[];
    value: string | boolean | string[];
}

export interface TraceAddItemMessage {
    type: 'addItem';
    path: (string | number)[];
    addChildKind: NonNullable<TraceConfigurationRow['addChildKind']>;
}

export interface TraceRemoveItemMessage {
    type: 'removeItem';
    path: (string | number)[];
}

export type TraceWebviewToHostMessage =
    | TraceReadyMessage
    | TraceRefreshMessage
    | TraceSaveMessage
    | TraceOpenFileMessage
    | TraceToggleMessage
    | TraceUpdateValueMessage
    | TraceAddItemMessage
    | TraceRemoveItemMessage;

export interface TraceUpdateMessage {
    type: 'update';
    state: TraceConfigurationState;
}

export type TraceHostToWebviewMessage = TraceUpdateMessage;
