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

import * as path from 'path';
import { GDBTargetDebugSession } from '../../debug-session';
import { ScvdCollector } from '../component-viewer/component-viewer-base';
import { componentViewerLogger } from '../../logger';
import { CorePeripheralsIndexReader } from './core-peripherals-index-reader';
import { CorePeripheralEntryType } from './core-peripherals-index-types';
import { ProcessorType } from '../../cbuild-run';

// Relative to dist folder at runtime
const CORE_PERIPHERAL_SCVD_BASE = path.resolve(__dirname, '..', 'configs', 'core-peripherals');

export class CorePeripheralsScvdCollector implements ScvdCollector {
    private indexFilePath: string;
    private indexReader: CorePeripheralsIndexReader;

    public constructor(private readonly basePath: string = CORE_PERIPHERAL_SCVD_BASE) {
        this.indexFilePath = path.resolve(this.basePath, 'core-peripherals-index.yml');
        this.indexReader = new CorePeripheralsIndexReader();
    }

    private async getActiveProcessor(session: GDBTargetDebugSession, processors: ProcessorType[]): Promise<ProcessorType | undefined> {
        const pname = await session.getPname();
        if (!pname) {
            // No pname info available, return first processor in list as best effort
            return processors[0];
        }
        const result = processors.find(processor => processor.pname === pname);
        return result ?? processors[0]; // If no exact match found, return first processor as fallback
    }

    private filterCpuType(entry: CorePeripheralEntryType, processorType: string): boolean {
        const cpuType = entry['cpu-type'];
        if (!cpuType) {
            // All CPU types supported
            return true;
        }
        const processorTypeLowerCase = processorType.toLowerCase();
        if (typeof cpuType === 'string') {
            // Single entry as string
            return cpuType === '*' || cpuType.toLowerCase() === processorTypeLowerCase;
        }
        // Array with multiple entries
        return cpuType.includes('*') || cpuType.some(type => type.toLowerCase() === processorTypeLowerCase);
    }

    private filterCpuFeatures(entry: CorePeripheralEntryType, processor: ProcessorType): boolean {
        const cpuFeatures = entry['cpu-features'];
        if (!cpuFeatures) {
            // No specific CPU features required
            return true;
        }
        const entryFeatures = Object.entries(cpuFeatures);
        const processorFeatures = Object.entries(processor);
        return entryFeatures.every(([entryFeatureKey, entryFeatureValue]) => {
            if (entryFeatureValue === '*') {
                return true;
            }
            const processorFeature = processorFeatures.find(([processorFeatureKey]) => processorFeatureKey === entryFeatureKey);
            if (!processorFeature) {
                // Required feature not found in processor info
                // NOTE: All features that are not available mean not supported. Only (optional) exceptions are: punits and endian.
                //       But these are currently not relevant for filtering core peripherals, so we can ignore them for now.
                return false;
            }
            const [, processorFeatureValue] = processorFeature;
            if (processorFeatureValue === undefined || processorFeatureValue === null) {
                // No valid value for processor feature, treat as not supported
                return false;
            }
            return processorFeatureValue.toString().toLowerCase() === entryFeatureValue.toLowerCase();
        });
    }

    private filterCorePeripheralEntry(entry: CorePeripheralEntryType, processor: ProcessorType): boolean {
        // Test if CPU type is included
        if (!this.filterCpuType(entry, processor.core)) {
            return false;
        }
        if (!this.filterCpuFeatures(entry, processor)) {
            return false;
        }
        return true;
    }

    public async getScvdFilePaths(session: GDBTargetDebugSession): Promise<string[]> {
        try {
            await this.indexReader.parse(this.indexFilePath);
        } catch (error) {
            componentViewerLogger.error(`Core Peripherals: Failed to parse index file ${this.indexFilePath}: ${error}`);
            return [];
        }
        const corePeripherals = this.indexReader.getCorePeripherals();
        if (corePeripherals.length === 0) {
            componentViewerLogger.warn(`Core Peripherals: No core peripherals found in index file ${this.indexFilePath}`);
            return [];
        }
        const cbuildRunReader = await session.getCbuildRun();
        const processors = cbuildRunReader?.getContents()?.['system-resources']?.processors;
        const activeProcessor = processors ? await this.getActiveProcessor(session, processors) : undefined;
        const filteredCorePeripherals = activeProcessor
            ? corePeripherals.filter(entry => this.filterCorePeripheralEntry(entry, activeProcessor))
            : corePeripherals;
        return filteredCorePeripherals.map(entry => entry.file);
    }
}
