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

import {TraceConfigurationRow} from './trace-configuration-protocol';

export const VIEW_ID = 'cmsis-debugger.traceConfiguration';
export const CTRACE_FILE_GLOB = '{**/ctrace.yml,**/ctrace.yaml,**/*.ctrace.yml,**/*.ctrace.yaml}';
export const CMSIS_SOLUTION_GET_CBUILD_RUN_FILE_COMMAND = 'cmsis-csolution.getCbuildRunFile';
export const EVENT_COUNTER_OPTIONS = ['CYCCNT', 'CPICNT', 'EXCCNT', 'SLEEPCNT', 'LSUCNT', 'FOLDCNT', 'PMU'];
export const PRIVILEGED_RANGE_OPTIONS = ['0-7', '8-15', '16-23', '24-31'];
export const STREAM_SYNC_PERIOD_OPTIONS = ['off', '16M', '64M', '256M'];
export const PC_SAMPLING_PERIOD_OPTIONS = [
    'off',
    '64',
    '128',
    '192',
    '256',
    '320',
    '384',
    '448',
    '512',
    '576',
    '640',
    '704',
    '768',
    '832',
    '896',
    '960',
    '1024',
    '2048',
    '3072',
    '4096',
    '5120',
    '6144',
    '7168',
    '8192',
    '9216',
    '10240',
    '11264',
    '12288',
    '13312',
    '14336',
    '15360',
    '16384',
];

export interface RowBuildContext {
    rows: TraceConfigurationRow[];
    collapsedRows: Set<string>;
}

export interface ProcessorTraceCapabilities {
    pname: string;
    core?: string | undefined;
    supportsTrace: boolean;
    dwtComparators: number;
    timestamps: boolean;
    exceptions: boolean;
    eventCounters: boolean;
    pmuEvents: boolean;
    instrumentationTrace: boolean;
    instructionTrace: boolean;
    pcSampling: boolean;
    timeSynchronization: boolean;
    streamSynchronization: boolean;
}

export type ProcessorTraceCapabilityTemplate = Omit<ProcessorTraceCapabilities, 'pname' | 'core'>;

export const NO_TRACE_CAPABILITIES: ProcessorTraceCapabilityTemplate = {
    supportsTrace: false,
    dwtComparators: 0,
    timestamps: false,
    exceptions: false,
    eventCounters: false,
    pmuEvents: false,
    instrumentationTrace: false,
    instructionTrace: false,
    pcSampling: false,
    timeSynchronization: false,
    streamSynchronization: false,
};

export const TB_ONLY_TRACE_CAPABILITIES: ProcessorTraceCapabilityTemplate = {
    ...NO_TRACE_CAPABILITIES,
    supportsTrace: true,
    instructionTrace: true,
};

export const CORTEX_M_DWT_4_TRACE_CAPABILITIES: ProcessorTraceCapabilityTemplate = {
    supportsTrace: true,
    dwtComparators: 4,
    timestamps: true,
    exceptions: true,
    eventCounters: true,
    pmuEvents: false,
    instrumentationTrace: true,
    instructionTrace: true,
    pcSampling: true,
    timeSynchronization: true,
    streamSynchronization: true,
};

export const CORTEX_M_DWT_8_PMU_TRACE_CAPABILITIES: ProcessorTraceCapabilityTemplate = {
    ...CORTEX_M_DWT_4_TRACE_CAPABILITIES,
    dwtComparators: 8,
    pmuEvents: true,
};

export const TRACE_CAPABILITIES_BY_CORE = new Map<string, ProcessorTraceCapabilityTemplate>([
    ['CM0', NO_TRACE_CAPABILITIES],
    ['CM0PLUS', TB_ONLY_TRACE_CAPABILITIES],
    ['CM1', NO_TRACE_CAPABILITIES],
    ['CM3', CORTEX_M_DWT_4_TRACE_CAPABILITIES],
    ['CM4', CORTEX_M_DWT_4_TRACE_CAPABILITIES],
    ['CM7', CORTEX_M_DWT_4_TRACE_CAPABILITIES],
    ['CM23', TB_ONLY_TRACE_CAPABILITIES],
    ['CM33', CORTEX_M_DWT_4_TRACE_CAPABILITIES],
    ['CM35P', CORTEX_M_DWT_4_TRACE_CAPABILITIES],
    ['CM52', CORTEX_M_DWT_8_PMU_TRACE_CAPABILITIES],
    ['CM55', CORTEX_M_DWT_8_PMU_TRACE_CAPABILITIES],
    ['CM85', CORTEX_M_DWT_8_PMU_TRACE_CAPABILITIES],
]);