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

import { PerfStats } from './perf-stats';
import { ParsePerfStats } from './parse-perf-stats';
import { TargetReadStats, TargetReadTiming } from './target-read-stats';

export const PERF_ENABLED = false;
export const PARSE_PERF_ENABLED = true;
export const TARGET_READ_STATS_ENABLED = true;

const globalOverrides = globalThis as unknown as {
    __SCVD_PERF_ENABLED__?: boolean;
    __SCVD_PARSE_PERF_ENABLED__?: boolean;
    __SCVD_TARGET_READ_STATS_ENABLED__?: boolean;
};
const perfEnabled = globalOverrides.__SCVD_PERF_ENABLED__ ?? PERF_ENABLED;
const parsePerfEnabled = globalOverrides.__SCVD_PARSE_PERF_ENABLED__ ?? PARSE_PERF_ENABLED;
const targetReadStatsEnabled = globalOverrides.__SCVD_TARGET_READ_STATS_ENABLED__ ?? TARGET_READ_STATS_ENABLED;

export const perf = perfEnabled ? new PerfStats() : undefined;
export const parsePerf = parsePerfEnabled ? new ParsePerfStats() : undefined;
export const targetReadStats = targetReadStatsEnabled ? new TargetReadStats() : undefined;
export const targetReadTimingStats = targetReadStatsEnabled ? new TargetReadTiming() : undefined;
