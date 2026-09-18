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

export const SWO_CSV_ROW_HEIGHT = 24;
export const SWO_CSV_MAX_SCROLL_HEIGHT = 30_000_000;

export interface SwoCsvScrollGeometry {
    readonly logicalTableHeight: number;
    readonly scrollHeight: number;
    readonly scrollScale: number;
    readonly logicalScrollTop: number;
    readonly firstVisibleRow: number;
}

export const getSwoCsvScrollGeometry = (totalRowCount: number, scrollTop: number, viewportHeight: number): SwoCsvScrollGeometry => {
    const logicalTableHeight = totalRowCount * SWO_CSV_ROW_HEIGHT;
    const scrollHeight = Math.min(logicalTableHeight, SWO_CSV_MAX_SCROLL_HEIGHT);
    const physicalScrollRange = Math.max(0, scrollHeight - viewportHeight);
    const logicalScrollRange = Math.max(0, logicalTableHeight - viewportHeight);
    const scrollScale = physicalScrollRange > 0
        ? logicalScrollRange / physicalScrollRange
        : 1;
    const logicalScrollTop = scrollTop >= physicalScrollRange
        ? logicalScrollRange
        : Math.min(logicalScrollRange, scrollTop * scrollScale);
    return {
        logicalTableHeight,
        scrollHeight,
        scrollScale,
        logicalScrollTop,
        firstVisibleRow: Math.max(0, Math.floor(logicalScrollTop / SWO_CSV_ROW_HEIGHT)),
    };
};
