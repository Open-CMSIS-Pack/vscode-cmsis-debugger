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
    isRowSelected,
    selectRowRange,
    selectSingleRow,
    toggleRow,
    type RowSelectionMovement,
    type RowSelectionState,
} from '../../../views/csv-table-viewer/row-selection';

export interface CsvTableSelectedCell {
    readonly rowIndex: number;
    readonly columnIndex: number;
}

export interface CsvTableNavigationTarget {
    readonly rowIndex: number;
    readonly columnIndex: number | null;
}

interface CsvTableNavigationModifiers {
    readonly shiftKey: boolean;
    readonly primaryModifier: boolean;
}

interface CsvTableNavigationOptions extends CsvTableNavigationTarget, CsvTableNavigationModifiers {
    readonly key: string;
    readonly rowCount: number;
    readonly columnCount: number;
    readonly pageSize: number;
}

interface CsvTableKeyboardTarget extends CsvTableNavigationTarget {
    readonly movement: RowSelectionMovement;
}

interface CsvTableClickOptions extends CsvTableNavigationTarget, CsvTableNavigationModifiers {
    readonly selection: RowSelectionState;
    readonly selectedCell: CsvTableSelectedCell | null;
    readonly clickCount: number;
    readonly altKey: boolean;
}

interface CsvTableClickTarget extends CsvTableNavigationTarget {
    readonly selection: RowSelectionState;
}

export const getCsvTableClickTarget = ({
    selection, selectedCell, rowIndex, columnIndex, clickCount, shiftKey, altKey, primaryModifier,
}: CsvTableClickOptions): CsvTableClickTarget | null => {
    if (clickCount > 1) {
        return null;
    }
    const selectRow = columnIndex === null || shiftKey || altKey || primaryModifier
        || (!isRowSelected(selection, rowIndex) && selectedCell?.rowIndex !== rowIndex);
    return {
        rowIndex,
        columnIndex: selectRow ? null : columnIndex,
        selection: selectRow
            ? shiftKey ? selectRowRange(selection, rowIndex) : altKey ? toggleRow(selection, rowIndex) : selectSingleRow(rowIndex)
            : { intervals: [], caret: rowIndex, anchor: rowIndex },
    };
};

export const getCsvTableNavigationTarget = ({
    key, rowIndex, columnIndex, rowCount, columnCount, pageSize, shiftKey, primaryModifier,
}: CsvTableNavigationOptions): CsvTableKeyboardTarget | null => {
    if (rowCount === 0) {
        return null;
    }
    let destination = rowIndex;
    switch (key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
            if (columnCount === 0 || shiftKey || primaryModifier) {
                return null;
            }
            const destinationColumn = columnIndex === null ? 0 : columnIndex + (key === 'ArrowLeft' ? -1 : 1);
            return {
                rowIndex,
                columnIndex: destinationColumn < 0 ? null : Math.min(columnCount - 1, destinationColumn),
                movement: 'replace',
            };
        }
        case 'ArrowUp':
            destination -= 1;
            break;
        case 'ArrowDown':
            destination += 1;
            break;
        case 'PageUp':
            destination -= pageSize;
            break;
        case 'PageDown':
            destination += pageSize;
            break;
        case 'Home':
            destination = 0;
            break;
        case 'End':
            destination = rowCount - 1;
            break;
        default:
            return null;
    }
    return {
        rowIndex: Math.max(0, Math.min(rowCount - 1, destination)),
        columnIndex: null,
        movement: shiftKey ? 'extend' : primaryModifier ? 'caret-only' : 'replace',
    };
};

export const getCsvTableMenuItemIndex = (key: string, currentIndex: number, itemCount: number): number | null => {
    if (itemCount === 0) {
        return null;
    }
    switch (key) {
        case 'ArrowDown': return (currentIndex + 1) % itemCount;
        case 'ArrowUp': return (currentIndex + itemCount - 1) % itemCount;
        case 'Home': return 0;
        case 'End': return itemCount - 1;
        default: return null;
    }
};
