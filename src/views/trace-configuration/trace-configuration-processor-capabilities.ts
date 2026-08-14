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

import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import { isYamlMapItem, isYamlScalarItem, isYamlSequenceItem, YamlTreeItem, yamlScalarToString } from '../../desktop/yaml-dom';
import { logger } from '../../logger';
import { FileLocationManager } from '../../utils';
import { CTraceYamlFile } from './ctrace-yaml';
import * as TraceConfigurationTypes from './trace-configuration-types';

interface ConfiguredProcessor {
    index: number;
    displayName: string;
    core?: string | undefined;
}

/**
 * TraceConfigurationProcessorCapabilities owns the processor-to-trace-feature lookup used by the
 * trace configuration UI. It reads only enough project context to identify processor cores, then
 * maps those core names to the static capability templates stored in trace-configuration-types.
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
     * load rebuilds the capability map from the active ctrace.yml setup list and cbuild-run.yml file
     * when available. Capability templates are selected from processor cores only; pname values are
     * retained only as display names for the webview.
     */
    public async load(): Promise<void> {
        this.processorCapabilities.clear();

        try {
            const processors = await this.getCBuildRunProcessors();
            const configuredProcessors = this.getConfiguredProcessors();

            for (const configuredProcessor of configuredProcessors) {
                const processor = processors.at(configuredProcessor.index);
                const core = configuredProcessor.core ?? (processor ? this.getProcessorCoreForCapabilities(processor) : undefined);

                this.processorCapabilities.set(
                    this.setupIndexToCapabilitiesKey(configuredProcessor.index),
                    this.createTraceCapabilities(configuredProcessor.displayName, core)
                );
            }
        } catch (error) {
            logger.warn('Unable to load processor trace capabilities: ' + this.errorToString(error));

            for (const configuredProcessor of this.getConfiguredProcessors()) {
                this.processorCapabilities.set(
                    this.setupIndexToCapabilitiesKey(configuredProcessor.index),
                    this.createTraceCapabilities(configuredProcessor.displayName, configuredProcessor.core)
                );
            }
        }
    }

    /**
     * getForPath finds the processor that owns a YAML path and returns its capability limits. This
     * lets row generation hide or disable controls based on the core that contains the row.
     */
    public getForPath(nodePath: Array<string | number>): TraceConfigurationTypes.ProcessorTraceCapabilities | undefined {
        const setupIndex = this.getSetupIndexForPath(nodePath);
        return setupIndex === undefined ? undefined : this.processorCapabilities.get(this.setupIndexToCapabilitiesKey(setupIndex));
    }

    /**
     * getProcessorNameForPath resolves the display name for a setup entry. pname is used when present;
     * otherwise core is used so processor rows can still render as Processor:<core>.
     */
    public getProcessorNameForPath(nodePath: Array<string | number>): string | undefined {
        const ctraceFile = this.getCTraceFile();
        const setupIndex = this.getSetupIndexForPath(nodePath);

        if (!ctraceFile?.document || setupIndex === undefined) {
            return undefined;
        }

        const setupItem = ctraceFile.document.yaml.getItem(['ctrace', 'setup', setupIndex]);

        if (isYamlMapItem(setupItem)) {
            return this.getConfiguredProcessorDisplayName(setupItem);
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
     * the caller will fall back to ctrace.yml core values when present.
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
     * getProcessorCoreForCapabilities returns the processor core identity from cbuild-run data.
     * cbuild-run pname values are deliberately ignored here because trace capabilities only depend
     * on the core.
     */
    private getProcessorCoreForCapabilities(processor: ProcessorType): string | undefined {
        return processor.core;
    }

    /**
     * getConfiguredProcessors scans the active ctrace.yml setup list for display names and optional
     * core values. pname is kept only as display text; core is the only ctrace value used for trace
     * capability lookup.
     */
    private getConfiguredProcessors(): ConfiguredProcessor[] {
        const setup = this.getCTraceFile()?.document?.yaml.getItem(['ctrace', 'setup']);

        if (!isYamlSequenceItem(setup)) {
            return [];
        }

        return setup.getChildren()
            .flatMap((item, index) => {
                if (!isYamlMapItem(item)) {
                    return [];
                }
                const core = this.mapScalarToString(item.getChild('core'));
                return [{
                    index,
                    displayName: this.getConfiguredProcessorDisplayName(item) ?? `Processor ${index + 1}`,
                    ...(core ? { core } : {})
                }];
            });
    }

    /**
     * createTraceCapabilities looks up the processor core using documented Dcore values that have
     * Cortex-M trace capability equivalents. Unknown or unsupported processors intentionally get the
     * no-trace template so the UI does not expose unsupported controls optimistically.
     */
    private createTraceCapabilities(displayName: string, coreName?: string): TraceConfigurationTypes.ProcessorTraceCapabilities {
        const template = coreName
            ? TraceConfigurationTypes.TRACE_CAPABILITIES_BY_CORE.get(coreName) ?? TraceConfigurationTypes.NO_TRACE_CAPABILITIES
            : TraceConfigurationTypes.NO_TRACE_CAPABILITIES;

        return {
            displayName,
            core: coreName,
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
     * mapScalarToString safely converts YAML scalar nodes into strings for capability lookup. YAML maps
     * can also return raw values, so the fallback keeps this helper defensive around parser details.
     */
    private mapScalarToString(node: YamlTreeItem | undefined): string | undefined {
        return isYamlScalarItem(node) ? yamlScalarToString(node) : undefined;
    }

    private getConfiguredProcessorDisplayName(setupItem: YamlTreeItem): string | undefined {
        return this.mapScalarToString(setupItem.getChild('pname')) ?? this.mapScalarToString(setupItem.getChild('core'));
    }

    private setupIndexToCapabilitiesKey(setupIndex: number): string {
        return String(setupIndex);
    }

    /**
     * errorToString converts unknown thrown values into readable log messages without assuming that
     * every thrown value is an Error object.
     */
    private errorToString(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
