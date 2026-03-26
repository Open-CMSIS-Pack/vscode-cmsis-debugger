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

import * as vscode from 'vscode';
import { componentViewerLogger } from '../../../logger';
import {
    IPeripheralInspectorAPI,
    InterruptTable,
    InterruptEntry
} from '@eclipse-cdt-cloud/vscode-peripheral-inspector/api';

const PERIPHERAL_INSPECTOR_EXTENSION_ID = 'eclipse-cdt.peripheral-inspector';

/**
 * Host for interrupt table data from the Peripheral Inspector API.
 *
 * Self-contained: handles extension discovery, lazy activation, and table fetching.
 * The SVD file path is set per component-viewer instance. On the first lookup via
 * {@link getName} or {@link getEntry}, the Peripheral Inspector extension is activated
 * (if needed) and the interrupt table is fetched and cached.
 */
export class InterruptHost {
    private _table: InterruptTable | undefined;
    private _fetched = false;
    private _svdPath: string | undefined;
    private readonly _extension: vscode.Extension<IPeripheralInspectorAPI> | undefined;

    constructor() {
        this._extension = vscode.extensions.getExtension<IPeripheralInspectorAPI>(PERIPHERAL_INSPECTOR_EXTENSION_ID);
    }

    /**
     * Set the SVD file path for interrupt table lookups.
     * Must be called before the first lookup; once the table has been fetched
     * the path is locked for the lifetime of this instance (one-shot fetch).
     */
    public setSvdPath(path: string | undefined): void {
        this._svdPath = path;
    }

    /**
     * Look up an interrupt entry by its number.
     * On first call, triggers lazy fetch from the Peripheral Inspector API.
     *
     * @param irqNumber The interrupt number to look up.
     * @returns The interrupt entry, or undefined if not found or table unavailable.
     */
    public async getEntry(irqNumber: number): Promise<InterruptEntry | undefined> {
        const table = await this.ensureTable();
        return table?.interrupts?.[`${irqNumber}`];
    }

    /**
     * Look up an interrupt name by its number.
     * On first call, triggers lazy fetch from the Peripheral Inspector API.
     *
     * @param irqNumber The interrupt number to look up.
     * @returns The interrupt name, or undefined if not found or table unavailable.
     */
    public async getName(irqNumber: number): Promise<string | undefined> {
        const entry = await this.getEntry(irqNumber);
        return entry?.name;
    }

    /**
     * Check whether the interrupt table has been fetched (regardless of result).
     */
    public get isFetched(): boolean {
        return this._fetched;
    }

    private async ensureTable(): Promise<InterruptTable | undefined> {
        if (this._fetched) {
            return this._table;
        }
        this._fetched = true;

        if (!this._svdPath || !this._extension) {
            return undefined;
        }

        // Activate the Peripheral Inspector extension if not yet active
        if (!this._extension.isActive) {
            return undefined;
        }

        const api = this._extension.exports;
        if (!api.getInterruptTable) {
            componentViewerLogger.debug('[InterruptHost] Peripheral Inspector API does not provide \'getInterruptTable()\'');
            return undefined;
        }

        this._table = api.getInterruptTable(this._svdPath);
        if (this._table) {
            componentViewerLogger.debug(`[InterruptHost] Interrupt table loaded: ${Object.keys(this._table.interrupts).length} entries from ${this._svdPath}`);
        } else {
            componentViewerLogger.debug(`[InterruptHost] Interrupt table not available for ${this._svdPath}`);
        }

        return this._table;
    }
}
