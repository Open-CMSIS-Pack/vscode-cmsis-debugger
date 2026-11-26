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
import * as vscode from 'vscode';
import { CbuildRunReader } from '../../cbuild-run/cbuild-run-reader';
import { logger } from '../../logger';
import { CbuildRunSymbolService, SymbolBuild } from '../../symbols/cbuild-run-symbol-service';
import { GdbSymbolHandler } from '../../symbols/gdb-symbol-handler';
import { SymbolFileAccess, SymbolLog } from '../../symbols/symbol-backend';
import { normalizeFsPath } from '../../utils';
import { SymbolService } from '../../symbols/symbol-service';
import { BuiltinToolPath } from '../builtin-tool-path';
import { FileWatchManager } from '../filesystem/file-watch-manager';
import { CdtGdbSymbolSession } from './cdt-gdb-symbol-session';

export type { SymbolAddress, SymbolHandler, SymbolImage, SymbolLookupOptions, SymbolMatch, SymbolResolver, SymbolService } from '../../symbols/symbol-service';

/** Creates an explicitly owned service; no workers start until a configured processor is queried.
 * The caller selects the cbuild-run.yml with setBuildFile and must await dispose at shutdown.
 */
export function createSymbolService(options: { readonly gdbPath?: string } = {}): SymbolService {
    const watches = new FileWatchManager();
    let nextWatch = 0;
    const files: SymbolFileAccess = {
        /** Registers exact-path callbacks while allowing literal glob characters in filenames. */
        watch(file, changed) {
            const id = `offline-symbols-${nextWatch++}`;
            const onEvent = (uri: vscode.Uri): void => {
                if (normalizeFsPath(uri.fsPath) === normalizeFsPath(file)) {
                    changed();
                }
            };
            watches.addWatch({
                id,
                globPattern: new vscode.RelativePattern(path.dirname(file), '*'),
                onDidCreate: onEvent,
                onDidChange: onEvent,
                onDidDelete: onEvent
            });
            return { dispose: () => { watches.removeWatch(id); } };
        },
        /** Checks image availability without requiring it to exist when its watch is created. */
        async exists(file) {
            try {
                const stat = await vscode.workspace.fs.stat(vscode.Uri.file(file));
                return (stat.type & vscode.FileType.File) !== 0;
            } catch {
                return false;
            }
        }
    };
    const log: SymbolLog = (message, error) => logger.warn(`${message} ${String(error)}`);
    return new CbuildRunSymbolService({
        files,
        log,
        readBuild: readSymbolBuild,
        createHandler: pname => new GdbSymbolHandler({
            files,
            log: (message, error) => log(`[${pname ?? 'unnamed'}] ${message}`, error),
            createSession: () => {
                const gdbPath = options.gdbPath ?? new BuiltinToolPath('tools/gdb/bin/arm-none-eabi-gdb').getAbsolutePath()?.fsPath;
                if (!gdbPath) {
                    throw new Error('Cannot find the bundled GDB for offline symbol lookup.');
                }
                return new CdtGdbSymbolSession(gdbPath);
            }
        })
    });
}

/** Reads one fresh snapshot so a failed parse can never reuse metadata from another build. */
async function readSymbolBuild(file: string): Promise<SymbolBuild> {
    const reader = new CbuildRunReader();
    await reader.parse(file);
    const contents = reader.getContents();
    const topology = contents?.['debug-topology']?.processors;
    const resources = contents?.['system-resources']?.processors;
    if ((topology !== undefined && !Array.isArray(topology)) || (resources !== undefined && !Array.isArray(resources))) {
        throw new Error('Invalid cbuild-run processor list.');
    }
    const processors = topology?.length ? topology : resources ?? [];
    for (const processor of processors) {
        if (!processor || typeof processor !== 'object' || (processor.pname !== undefined &&
            (typeof processor.pname !== 'string' || !processor.pname.trim()))) {
            throw new Error('Invalid cbuild-run processor name.');
        }
    }
    const images = reader.getSymbolImages();
    let pnames: (string | undefined)[] = [undefined];
    if (processors.length) {
        pnames = processors.map(processor => processor.pname);
    } else if (images.some(image => image.pname !== undefined)) {
        pnames = images.flatMap(image => image.pname === undefined ? [] : [image.pname]);
    }
    return { processors: [...new Set(pnames)], images };
}
