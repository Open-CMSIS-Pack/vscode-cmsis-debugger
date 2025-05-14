/**
 * Copyright 2025 Arm Limited
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

export type OutputFileType = 'lib'|'elf'|'hex'|'bin'|string;
export type LoadType = 'image+symbols'|'symbols'|'image'|'none';

export interface OutputType {
    file: string;
    type: OutputFileType;
    info?: string;
    load: LoadType;
    'load-offset'?: number;
    pname?: string;
};

export interface MemoryType {
    name: string;
    access: string;
    start: number;
    size: number;
    pname?: string;
    alias?: string;
    'from-pack'?: string;
};

export interface SystemResourcesType {
    memory?: MemoryType[];
};

export type SystemDescriptionTypeType = 'svd'|'scvd';

export interface SystemDescriptionType {
    file: string;
    type: SystemDescriptionTypeType;
    info?: string;
    pname?: string;
};

export interface GdbserverType {
    port: number;
    pname?: string;
    punit?: number;
};

export type ProtocolType = 'swd'|'jtag';

export interface DebuggerType {
    name: string;
    info?: string;
    protocol?: ProtocolType;
    clock?: number;
    dbgconf?: string;
    'start-pname'?: string;
    gdbserver?: GdbserverType[];
    terminal?: string;
    trace?: string;
};

export interface DebugVarsType {
    vars: string;
};

export interface BlockType {
    info?: string;
    blocks?: BlockType[];
    execute?: string;
    atomic?: void;
    if?: string;
    while?: string;
    timeout?: number;
};

export interface DebugSequenceType {
    name: string;
    info?: string;
    blocks?: BlockType[];
    pname?: string;
};

export interface ProgrammingType {
    algorithm: string;
    start: number;
    size: number;
    'ram-start': number;
    'ram-size': number;
    pname?: string;
};

export interface JtagType {
    tapindex?: number;
};

export interface SwdType {
    targetsel?: number;
};

export interface DatapatchType {
    address: number;
    value: number;
    mask?: number;
    type?: string;
    info?: string;
};

export interface AccessPortType {
    apid: number;
    index?: number;
    address?: number;
    HPROT?: number;
    SPROT?: number;
    datapatch?: DatapatchType[];
    accessports?: AccessPortType[];
};

export interface DebugPortType {
    dpid: number;
    jtag?: JtagType;
    swd?: SwdType;
    accessports?: AccessPortType[];
};

export type ResetSequenceType = 'ResetSystem'|'ResetHardware'|'ResetProcessor'|string;

export interface PunitType {
    punit: number;
    address: number;
};

export interface ProcessorType {
    pname?: string;
    punits?: PunitType[];
    apid?: number;
    'reset-sequence'?: ResetSequenceType;
};

export interface DebugTopologyType {
    debugports?: DebugPortType[];
    processors?: ProcessorType[];
    swj?: boolean;
    dormant?: boolean;
    sdf?: string;
};

export interface CbuildRunType {
    'generated-by'?: string;
    'solution'?: string;
    'target-type'?: string;
    'target-set'?: string;
    compiler?: string;
    board?: string;
    'board-pack'?: string;
    device?: string;
    'device-pack'?: string;
    output: OutputType[];
    'system-resources'?: SystemResourcesType;
    'system-descriptions'?: SystemDescriptionType[];
    debugger: DebuggerType;
    'debug-vars': DebugVarsType;
    'debug-sequences'?: DebugSequenceType[];
    programming?: ProgrammingType[];
    'debug-topology'?: DebugTopologyType;
};
