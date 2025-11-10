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

import { PeriodicRefreshTimer } from './periodic-refresh-timer';

describe('PeriodicRefreshTimer', () => {
    let refreshTimer: PeriodicRefreshTimer<string>;

    beforeEach(() => {
        refreshTimer = new PeriodicRefreshTimer<string>('test-timer', 10);
    });

    afterEach(() => {
        // Ensure underlying node timer is cleaned up.
        refreshTimer.stop();
    });

    it('returns correct enabled state through getter function', () => {
        refreshTimer.enabled = true;
        expect(refreshTimer.enabled).toBe(true);
        refreshTimer.enabled = false;
        expect(refreshTimer.enabled).toBe(false);
    });

    it('does not start if not enabled', () => {
        // Start timer when not enabled
        refreshTimer.start();
        expect(refreshTimer.isRunning).toBe(false);
    });

    it('starts if enabled and stops', () => {
        // Start timer when enabled
        refreshTimer.enabled = true;
        refreshTimer.start();
        expect(refreshTimer.isRunning).toBe(true);
        // Stop timer
        refreshTimer.stop();
        expect(refreshTimer.isRunning).toBe(false);
    });

    it('starts if enabled and stops when disabled', () => {
        // Start timer when enabled
        refreshTimer.enabled = true;
        refreshTimer.start();
        expect(refreshTimer.isRunning).toBe(true);
        // Disable timer
        refreshTimer.enabled = false;
        expect(refreshTimer.isRunning).toBe(false);
    });

    it('fires periodic refresh events', async () => {
        // Register listener function
        const refreshListener = jest.fn();
        refreshTimer.onRefresh(refreshListener);
        // Start timer when enabled
        refreshTimer.enabled = true;
        refreshTimer.start();
        expect(refreshTimer.isRunning).toBe(true);
        // Wait for a few intervals
        await new Promise((resolve) => setTimeout(resolve, 25));
        // Stop timer
        refreshTimer.stop();
        // Between one and two calls should have been made.
        // Timing sensitive, so only check we are in an expected range rather
        // than full accuracy.
        expect(refreshListener.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(refreshListener.mock.calls.length).toBeLessThanOrEqual(2);
        expect(refreshListener).toHaveBeenCalledWith('test-timer');
    });
});
