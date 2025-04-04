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

type OutputFileType = 'lib'|'elf'|'hex'|'bin';

interface OutputType {
    file: string;
    type: OutputFileType;
    info: string;
    run: string;
    debug: string;
};

interface MemoryType {
    name: string;
    access: string;
    start: number;
    size: number;
    pname?: string;
    alias?: string;
    'from-pack'?: string;
};

interface SystemResourcesType {
    memory?: MemoryType[];
};

export type SystemDescriptionTypeType = 'svd'|'scvd';

interface SystemDescriptionType {
    file: string;
    type: SystemDescriptionTypeType;
    info?: string;
};

type ProtocolType = 'swd'|'jtag';

interface DebuggerType {
    name: string;
    info?: string;
    protocol: ProtocolType;
    clock: number;
    dbgconf: string;
};

interface DebugVarsType {
    vars: string;
};

interface BlockType {
    info?: string;
    blocks?: BlockType[];
    execute?: string;
    atomic?: void;
    if?: string;
    while?: string;
    timeout?: number;
};

interface DebugSequenceType {
    name: string;
    info?: string;
    blocks?: BlockType[];
    pname?: string;
};

interface ProgrammingType {
    algorithm: string;
    start: number;
    size: number;
    'ram-start': number;
    'ram-size': number;
    pname?: string;
};

interface JtagType {
    tapindex?: number;
};

interface SwdType {
    targetsel?: number;
};

interface AccessPortType {
    apid: number;
    index?: number;
    address?: number;
    accessports?: AccessPortType[];
};

interface DebugPortType {
    dpid: number;
    jtag?: JtagType;
    swd?: SwdType;
    accessports?: AccessPortType[];
};

type ResetSequenceType = 'ResetSystem'|'ResetHardware'|'ResetProcessor'|string;

interface PunitType {
    punit: number;
    address?: number;
};

interface ProcessorType {
    pname: string;
    punits?: PunitType[];
    apid?: number;
    'reset-sequence': ResetSequenceType;
};

interface DebugTopologyType {
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
    compiler?: string;
    board?: string;
    'board-pack'?: string;
    device?: string;
    'device-pack'?: string;
    output: OutputType[];
    'system-resources'?: SystemResourcesType;
    'system-descriptions'?: SystemDescriptionType[];
    debugger: DebuggerType[];
    'debug-vars': DebugVarsType;
    'debug-sequences'?: DebugSequenceType[];
    programming?: ProgrammingType[];
    'debug-topology'?: DebugTopologyType;
};
