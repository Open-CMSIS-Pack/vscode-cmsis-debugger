/**
 * Copyright 2025-2026 Arm Limited
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
 *
 * Coverage for ScvdEventTracking.
 */

import { ScvdEventTracking, ScvdEventTrackingMode } from '../../model/scvd-event-tracking';

describe('ScvdEventTracking coverage', () => {
    it('maps string modes to enum values', () => {
        const tracking = new ScvdEventTracking(undefined, 'Start');
        expect(tracking.mode).toBe(ScvdEventTrackingMode.Start);

        tracking.mode = 'Stop';
        expect(tracking.mode).toBe(ScvdEventTrackingMode.Stop);

        tracking.mode = 'Reset';
        expect(tracking.mode).toBe(ScvdEventTrackingMode.Reset);
    });

    it('ignores undefined or unknown mode values', () => {
        const tracking = new ScvdEventTracking(undefined, 'Start');
        tracking.mode = undefined;
        expect(tracking.mode).toBe(ScvdEventTrackingMode.Start);

        tracking.mode = 'Unknown';
        expect(tracking.mode).toBeUndefined();
    });
});
