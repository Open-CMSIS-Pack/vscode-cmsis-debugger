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

import type { DebugProtocol } from '@vscode/debugprotocol';
import { GDBTargetDebugSession, GDBTargetDebugTracker, TargetState } from '..';

export type OnRefreshCallback = (session: Session) => void;

export type TestMemoryEvent = {
    session: Session;
    event: DebugProtocol.MemoryEvent;
};

export type TestInvalidatedEvent = {
    session: Session;
    event: DebugProtocol.InvalidatedEvent;
};

export type Session = {
    session: { id: string; configuration?: { name: string } };
    getCbuildRun: () => Promise<{ getScvdFilePaths: () => string[]; getTargetType: () => string | undefined } | undefined>;
    getConfigStateKey: () => Promise<string>;
    getPname: () => Promise<string | undefined>;
    refreshTimer: { onRefresh: (cb: OnRefreshCallback) => void };
    targetState?: TargetState;
    canAccessWhileRunning?: boolean;
};

export type TrackerCallbacks = {
    onWillStopSession: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onConnected: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onDidChangeActiveDebugSession: (cb: (session: Session | undefined) => Promise<void>) => { dispose: jest.Mock };
    onStackTrace: (cb: (session: { session: Session }) => Promise<void>) => { dispose: jest.Mock };
    onDidChangeActiveStackItem: (cb: (session: { session: Session }) => Promise<void>) => { dispose: jest.Mock };
    onWillStartSession: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onMemory: (cb: (event: TestMemoryEvent) => Promise<void>) => { dispose: jest.Mock };
    onInvalidated: (cb: (event: TestInvalidatedEvent) => Promise<void>) => { dispose: jest.Mock };
    callbacks: Partial<{
        willStop: (session: Session) => Promise<void>;
        connected: (session: Session) => Promise<void>;
        activeSession: (session: Session | undefined) => Promise<void>;
        stackTrace: (session: { session: Session }) => Promise<void>;
        activeStackItem: (session: { session: Session }) => Promise<void>;
        willStart: (session: Session) => Promise<void>;
        memory: (event: TestMemoryEvent) => Promise<void>;
        invalidated: (event: TestInvalidatedEvent) => Promise<void>;
    }>;
};

export const trackerFactory = (): TrackerCallbacks => {
    const callbacks: TrackerCallbacks['callbacks'] = {};
    return {
        callbacks,
        onWillStopSession: (cb) => {
            callbacks.willStop = cb;
            return { dispose: jest.fn() };
        },
        onConnected: (cb) => {
            callbacks.connected = cb;
            return { dispose: jest.fn() };
        },
        onDidChangeActiveDebugSession: (cb) => {
            callbacks.activeSession = cb;
            return { dispose: jest.fn() };
        },
        onStackTrace: (cb) => {
            callbacks.stackTrace = cb;
            return { dispose: jest.fn() };
        },
        onDidChangeActiveStackItem: (cb) => {
            callbacks.activeStackItem = cb;
            return { dispose: jest.fn() };
        },
        onWillStartSession: (cb) => {
            callbacks.willStart = cb;
            return { dispose: jest.fn() };
        },
        onMemory: (cb) => {
            callbacks.memory = cb;
            return { dispose: jest.fn() };
        },
        onInvalidated: (cb) => {
            callbacks.invalidated = cb;
            return { dispose: jest.fn() };
        },
    };
};

export const debugTrackerFactory = () => trackerFactory() as unknown as GDBTargetDebugTracker;

export const debugSessionFactory = (
    id: string,
    paths: string[] = [],
    targetState: Session['targetState'] = 'unknown',
    pname: string | undefined = undefined,
    hasCbuildRun = true
): Session => {
    // Ensure same object returned for multiple calls to getCbuildRun.
    const cbuildRunMock = hasCbuildRun ? {
        getContents: jest.fn(),
        getScvdFilePaths: () => paths,
        getTargetType: jest.fn<string | undefined, []>(() => undefined),
    } : undefined;
    return {
        session: { id, configuration: { name: id } },
        getCbuildRun: jest.fn().mockResolvedValue(cbuildRunMock),
        getConfigStateKey: jest.fn().mockResolvedValue(id),
        getPname: async () => pname,
        refreshTimer: {
            onRefresh: jest.fn(),
        },
        targetState,
    };
};

export const gdbTargetDebugSessionFactory = (
    id: string,
    paths: string[] = [],
    targetState: Session['targetState'] = 'unknown',
    pname: string | undefined = undefined,
    hasCbuildRun = true
): GDBTargetDebugSession => (
    debugSessionFactory(id, paths, targetState, pname, hasCbuildRun) as unknown as GDBTargetDebugSession
);
