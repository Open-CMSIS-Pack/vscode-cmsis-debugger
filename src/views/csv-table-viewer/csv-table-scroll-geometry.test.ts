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

import {
    getCsvTableRowRevealScrollTop,
    getCsvTableScrollGeometry,
    CSV_TABLE_MAX_SCROLL_HEIGHT,
    CSV_TABLE_ROW_HEIGHT,
} from './csv-table-scroll-geometry';

describe('getCsvTableScrollGeometry', () => {
    const viewportHeight = 600;

    it('maps the end of a compressed 10-million-row scrollbar to the final viewport', () => {
        const totalRowCount = 10_000_000;
        const maximumScrollTop = CSV_TABLE_MAX_SCROLL_HEIGHT - viewportHeight;

        const geometry = getCsvTableScrollGeometry(totalRowCount, maximumScrollTop, viewportHeight);

        expect(geometry.logicalScrollTop).toBe(totalRowCount * CSV_TABLE_ROW_HEIGHT - viewportHeight);
        expect(geometry.firstVisibleRow).toBe(totalRowCount - viewportHeight / CSV_TABLE_ROW_HEIGHT);
    });

    it('keeps uncompressed scrolling at a one-to-one scale', () => {
        const geometry = getCsvTableScrollGeometry(200_000, 12_345, viewportHeight);

        expect(geometry.scrollScale).toBe(1);
        expect(geometry.logicalScrollTop).toBe(12_345);
    });
});

describe('getCsvTableRowRevealScrollTop', () => {
    const viewportHeight = 600;

    it.each([200_000, 10_000_000])('reveals partially clipped rows without overshooting for %i rows', totalRowCount => {
        const { scrollScale } = getCsvTableScrollGeometry(totalRowCount, 0, viewportHeight);
        const logicalScrollTop = 2_412;
        const scrollTop = logicalScrollTop / scrollScale;

        const revealAbove = getCsvTableRowRevealScrollTop(totalRowCount, scrollTop, viewportHeight, 100);
        const revealBelow = getCsvTableRowRevealScrollTop(totalRowCount, scrollTop, viewportHeight, 125);

        expect(revealAbove).toBe(Math.floor(2_400 / scrollScale));
        expect(revealBelow).toBe(Math.ceil(2_424 / scrollScale));
        const logicalRevealAbove = getCsvTableScrollGeometry(totalRowCount, revealAbove, viewportHeight).logicalScrollTop;
        const logicalRevealBelow = getCsvTableScrollGeometry(totalRowCount, revealBelow, viewportHeight).logicalScrollTop;
        expect(logicalRevealAbove).toBeLessThanOrEqual(2_400);
        expect(logicalRevealAbove).toBeGreaterThan(2_400 - scrollScale);
        expect(logicalRevealBelow).toBeGreaterThanOrEqual(2_424);
        expect(logicalRevealBelow).toBeLessThan(2_424 + scrollScale);
    });

    it.each([200_000, 10_000_000])('keeps fully visible rows stationary for %i rows', totalRowCount => {
        const scrollTop = 123;

        const { firstVisibleRow } = getCsvTableScrollGeometry(totalRowCount, scrollTop, viewportHeight);
        const revealedScrollTop = getCsvTableRowRevealScrollTop(totalRowCount, scrollTop, viewportHeight, firstVisibleRow + 1);

        expect(revealedScrollTop).toBeCloseTo(scrollTop);
    });

    it('reveals the first and last rows at the ends of a compressed scrollbar', () => {
        const totalRowCount = 10_000_000;
        const maximumScrollTop = CSV_TABLE_MAX_SCROLL_HEIGHT - viewportHeight;

        expect(getCsvTableRowRevealScrollTop(totalRowCount, maximumScrollTop, viewportHeight, 0)).toBe(0);
        expect(getCsvTableRowRevealScrollTop(totalRowCount, 0, viewportHeight, totalRowCount - 1)).toBeCloseTo(maximumScrollTop);
    });

    it('does not scroll when the whole table fits in the viewport', () => {
        expect(getCsvTableRowRevealScrollTop(10, 0, viewportHeight, 9)).toBe(0);
    });
});
