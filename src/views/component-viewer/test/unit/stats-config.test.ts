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

// generated with AI

/**
 * Unit test for stats-config overrides.
 */

import { PerfStats } from '../../perf-stats';
import { TargetReadStats, TargetReadTiming } from '../../target-read-stats';

type GlobalOverrides = {
    __SCVD_PERF_ENABLED__?: boolean;
    __SCVD_TARGET_READ_STATS_ENABLED__?: boolean;
};

const overrides = globalThis as unknown as GlobalOverrides;

async function loadConfig() {
    jest.resetModules();
    return await import('../../stats-config');
}

describe('stats-config', () => {
    afterEach(() => {
        delete overrides.__SCVD_PERF_ENABLED__;
        delete overrides.__SCVD_TARGET_READ_STATS_ENABLED__;
    });

    it('uses defaults when no overrides are provided', async () => {
        const mod = await loadConfig();

        expect(mod.perf).toBeUndefined();
        expect(mod.targetReadStats?.constructor.name).toBe(TargetReadStats.name);
        expect(mod.targetReadTimingStats?.constructor.name).toBe(TargetReadTiming.name);
    });

    it('respects global overrides for perf and target read stats', async () => {
        overrides.__SCVD_PERF_ENABLED__ = true;
        overrides.__SCVD_TARGET_READ_STATS_ENABLED__ = false;

        const mod = await loadConfig();

        expect(mod.perf?.constructor.name).toBe(PerfStats.name);
        expect(mod.targetReadStats).toBeUndefined();
        expect(mod.targetReadTimingStats).toBeUndefined();
    });
});
