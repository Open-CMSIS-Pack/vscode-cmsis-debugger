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

/**
 * Unit tests for ExecutionCancellation.
 */

import { ExecutionCancellation } from '../../execution-cancellation';

const DEFAULT_MS = ExecutionCancellation.DEFAULT_TIMEOUT_MS;

describe('ExecutionCancellation', () => {
    it('starts in non-cancelled state', () => {
        const ec = new ExecutionCancellation();
        expect(ec.isCancelled).toBe(false);
        expect(ec.reason).toBeUndefined();
        expect(ec.checkDeadline()).toBe(false);
    });

    it('cancel sets isCancelled and reason', () => {
        const ec = new ExecutionCancellation();
        ec.cancel('session ended');
        expect(ec.isCancelled).toBe(true);
        expect(ec.reason).toBe('session ended');
    });

    it('cancel is idempotent – first reason wins', () => {
        const ec = new ExecutionCancellation();
        ec.cancel('first');
        ec.cancel('second');
        expect(ec.reason).toBe('first');
        expect(ec.isCancelled).toBe(true);
    });

    it('checkDeadline returns false when not cancelled and deadline is in the future', () => {
        const ec = new ExecutionCancellation();
        ec.reset(10_000);
        expect(ec.checkDeadline()).toBe(false);
        expect(ec.isCancelled).toBe(false);
    });

    it('checkDeadline returns true when already cancelled', () => {
        const ec = new ExecutionCancellation();
        ec.cancel('test');
        expect(ec.checkDeadline()).toBe(true);
    });

    it('checkDeadline auto-cancels when deadline is in the past', () => {
        const ec = new ExecutionCancellation();
        ec.reset(-1); // deadline already expired
        expect(ec.checkDeadline()).toBe(true);
        expect(ec.isCancelled).toBe(true);
        expect(ec.reason).toBe('executeAll timeout exceeded');
    });

    it('reset clears a previous cancellation and restores non-cancelled state', () => {
        const ec = new ExecutionCancellation();
        ec.cancel('old reason');
        ec.reset(10_000);
        expect(ec.isCancelled).toBe(false);
        expect(ec.reason).toBeUndefined();
        expect(ec.checkDeadline()).toBe(false);
    });

    it('reset without argument applies the default timeout', () => {
        const ec = new ExecutionCancellation();
        const before = Date.now();
        ec.reset();
        const after = Date.now();
        expect(ec.isCancelled).toBe(false);
        expect(ec.checkDeadline()).toBe(false);
        // deadline should be within [before + DEFAULT_MS, after + DEFAULT_MS]
        const deadline = (ec as unknown as { _deadline: number })._deadline;
        expect(deadline).toBeGreaterThanOrEqual(before + DEFAULT_MS);
        expect(deadline).toBeLessThanOrEqual(after + DEFAULT_MS);
    });

    it('reset stores the supplied timeout for subsequent resets', () => {
        const ec = new ExecutionCancellation();
        ec.reset(5_000);
        const before = Date.now();
        ec.reset(5_000);
        const after = Date.now();
        expect(ec.isCancelled).toBe(false);
        const deadline = (ec as unknown as { _deadline: number })._deadline;
        expect(deadline).toBeGreaterThanOrEqual(before + 5_000);
        expect(deadline).toBeLessThanOrEqual(after + 5_000);
    });
});
