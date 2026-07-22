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

import * as YAML from 'yaml';

import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import { CTraceYamlFile } from '../../generic';
import { logger } from '../../logger';
import { FileLocationManager } from '../../utils';
import * as TraceConfigurationTypes from './trace-configuration-types';

/**
 * TraceConfigurationProcessorCapabilities owns the processor-name-to-trace-feature lookup used by
 * the trace configuration UI. It reads only enough project context to identify processor cores,
 * then maps those core names to the static capability templates stored in trace-configuration-types.
 */
export class TraceConfigurationProcessorCapabilities {
    private readonly processorCapabilities = new Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities>();
    private readonly fileLocationManager = new FileLocationManager();
    private readonly cbuildRunReader = new CbuildRunReader();
    private readonly getCTraceFile: () => CTraceYamlFile | undefined;

    /**
     * The constructor stores the active ctrace file provider supplied by the model. The provider is
     * assigned to a normal readonly member instead of using a constructor parameter property so all
     * long-lived collaborators are declared together at the top of the class.
     */
    public constructor(getCTraceFile: () => CTraceYamlFile | undefined) {
        this.getCTraceFile = getCTraceFile;
    }

    /**
     * capabilities exposes the current immutable lookup map to row builders. The map instance is
     * intentionally stable, so callers can keep a reference while load() refreshes its contents.
     */
    public get capabilities(): ReadonlyMap<string, TraceConfigurationTypes.ProcessorTraceCapabilities> {
        return this.processorCapabilities;
    }

    /**
     * clear removes all cached capability data when there is no active ctrace file. This prevents
     * a previously opened project from leaking processor restrictions into an empty or failed state.
     */
    public clear(): void {
        this.processorCapabilities.clear();
    }

    /**
     * load rebuilds the capability map from the active cbuild-run.yml file when available. The
     * cbuild-run file gives us processor names, and the actual trace limits come from the static
     * templates stored inside this extension. If cbuild-run data is unavailable, this method falls
     * back to processor names declared directly in the current ctrace.yml file.
     */
    public async load(): Promise<void> {
        this.processorCapabilities.clear();

        try {
            const processors = await this.getCBuildRunProcessors();
            const configuredProcessorNames = this.getConfiguredProcessorNames();

            for (const processor of processors) {
                const pname = this.getProcessorNameForCapabilities(processor);

                if (!pname) {
                    continue;
                }

                this.processorCapabilities.set(pname, this.createTraceCapabilities(pname));
            }

            for (const pname of configuredProcessorNames) {
                if (!this.processorCapabilities.has(pname)) {
                    this.processorCapabilities.set(pname, this.createTraceCapabilities(pname));
                }
            }
        } catch (error) {
            logger.warn('Unable to load processor trace capabilities: ' + this.errorToString(error));

            for (const pname of this.getConfiguredProcessorNames()) {
                this.processorCapabilities.set(pname, this.createTraceCapabilities(pname));
            }
        }
    }

    /**
     * getForPath finds the processor that owns a YAML path and returns its capability limits. This
     * lets row generation hide or disable controls based on the core that contains the row.
     */
    public getForPath(nodePath: Array<string | number>): TraceConfigurationTypes.ProcessorTraceCapabilities | undefined {
        const pname = this.getProcessorNameForPath(nodePath);
        return pname ? this.processorCapabilities.get(pname) : undefined;
    }

    /**
     * getProcessorNameForPath resolves a ctrace path back to its setup entry. The path can be either
     * the setup item itself or any descendant under that item, which is how capability checks connect
     * nested UI rows to their owning processor.
     */
    public getProcessorNameForPath(nodePath: Array<string | number>): string | undefined {
        const ctraceFile = this.getCTraceFile();
        const setupIndex = this.getSetupIndexForPath(nodePath);

        if (!ctraceFile?.document || setupIndex === undefined) {
            return undefined;
        }

        const setupItem = ctraceFile.document.yaml.getNode(['ctrace', 'setup', setupIndex]);

        if (YAML.isMap(setupItem)) {
            const pname = setupItem.get('pname');
            return this.mapScalarToString(pname);
        }

        return undefined;
    }

    /**
     * getSetupIndexForPath extracts the numeric setup array index from a ctrace path. The shape is
     * always ctrace.setup.<index>..., so paths outside setup cannot be mapped to processor limits.
     */
    public getSetupIndexForPath(nodePath: Array<string | number>): number | undefined {
        if (nodePath.length >= 3 && nodePath[0] === 'ctrace' && nodePath[1] === 'setup' && typeof nodePath[2] === 'number') {
            return nodePath[2];
        }

        return undefined;
    }

    /**
     * getCBuildRunProcessors asks the Arm CMSIS Solution extension for the active cbuild-run.yml path
     * and then reuses CbuildRunReader to parse processors from it. Missing extension data simply means
     * the caller will fall back to ctrace.yml processor names.
     */
    private async getCBuildRunProcessors(): Promise<ProcessorType[]> {
        const cbuildRunFilePath = await this.fileLocationManager.getCBuildRunFileName();

        if (!cbuildRunFilePath) {
            return [];
        }

        try {
            await this.cbuildRunReader.parse(cbuildRunFilePath);
            return this.cbuildRunReader.getProcessors();
        } catch (error) {
            logger.warn('Unable to read processors from ' + cbuildRunFilePath + ': ' + this.errorToString(error));
            return [];
        }
    }

    /**
     * getProcessorNameForCapabilities chooses the most specific processor identity available from
     * cbuild-run data. The pname field matches ctrace.yml directly, while processorName is a useful
     * fallback for generated files that omit pname.
     */
    private getProcessorNameForCapabilities(processor: ProcessorType): string | undefined {
        return processor.pname || processor.core;
    }

    /**
     * getConfiguredProcessorNames scans the active ctrace.yml setup list for pname values. These names
     * are used as a fallback when cbuild-run data is missing and as a supplement when ctrace.yml names
     * include processors that the current cbuild-run reader did not expose.
     */
    private getConfiguredProcessorNames(): string[] {
        const setup = this.getCTraceFile()?.document?.yaml.getNode(['ctrace', 'setup']);

        if (!YAML.isSeq(setup)) {
            return [];
        }

        return setup.items
            .map((item) => (YAML.isMap(item) ? this.mapScalarToString(item.get('pname')) : undefined))
            .filter((pname): pname is string => Boolean(pname));
    }

    /**
     * createTraceCapabilities normalizes a processor name and looks up the matching trace capability
     * template. Unknown processors intentionally get the no-trace template so the UI does not expose
     * unsupported controls optimistically.
     */
    private createTraceCapabilities(pname: string): TraceConfigurationTypes.ProcessorTraceCapabilities {
        const normalizedName = this.normalizeCoreName(pname);
        const template = normalizedName
            ? TraceConfigurationTypes.TRACE_CAPABILITIES_BY_CORE.get(normalizedName) ?? TraceConfigurationTypes.NO_TRACE_CAPABILITIES
            : TraceConfigurationTypes.NO_TRACE_CAPABILITIES;

        return {
            pname,
            core: normalizedName,
            supportsTrace: template.supportsTrace,
            dwtComparators: template.dwtComparators,
            timestamps: template.timestamps,
            exceptions: template.exceptions,
            eventCounters: template.eventCounters,
            pmuEvents: template.pmuEvents,
            instrumentationTrace: template.instrumentationTrace,
            instructionTrace: template.instructionTrace,
            pcSampling: template.pcSampling,
            timeSynchronization: template.timeSynchronization,
            streamSynchronization: template.streamSynchronization,
        };
    }

    /**
     * normalizeCoreName turns common Cortex spelling variants into stable lookup keys. The
     * documentation and generated files are not guaranteed to agree on hyphens or letter casing, so
     * this keeps capability matching tolerant without changing the original pname shown to users.
     */
    private normalizeCoreName(value?: string): string | undefined {
        if (!value) {
            return undefined;
        }
        const normalized = value
            .toUpperCase()
            .replace(/CORTEX[-_\s]?M/g, 'CM')
            .replace(/[-_\s]/g, '');
        if (normalized.includes('CM0PLUS') || normalized.includes('CM0+')) {
            return 'CM0PLUS';
        }
        const match = normalized.match(/CM(?:35P|85|55|33|23|7|4|3|1|0)/);
        return match?.[0];
    }

    /**
     * mapScalarToString safely converts YAML scalar nodes into strings for capability lookup. YAML maps
     * can also return raw values, so the fallback keeps this helper defensive around parser details.
     */
    private mapScalarToString(node: unknown): string | undefined {
        if (YAML.isScalar(node)) {
            return node.value === null || node.value === undefined ? undefined : String(node.value);
        }

        return node === null || node === undefined ? undefined : String(node);
    }

    /**
     * errorToString converts unknown thrown values into readable log messages without assuming that
     * every thrown value is an Error object.
     */
    private errorToString(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
