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
