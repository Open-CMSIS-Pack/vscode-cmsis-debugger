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

import React, { useLayoutEffect, useRef } from 'react';
import type { FlatRow, TooltipContent } from './types';

interface TreeRowProps {
    row: FlatRow;
    lockable: boolean;
    lockTooltip: string;
    unlockTooltip: string;
    selected: boolean;
    onToggle: (id: string, expanded: boolean) => void;
    onLock: (id: string) => void;
    onSelect: (id: string) => void;
    onTooltipEnter: (content: TooltipContent, e: React.MouseEvent) => void;
    onTooltipLeave: () => void;
}

const INDENT_PX = 16;

function buildTooltip(head: string | undefined, body: string | undefined): TooltipContent | undefined {
    const bodyLines = body ? body.split(/,\s*/) : undefined;
    if (!head && !bodyLines) {
        return undefined;
    }
    return { head, bodyLines };
}

function TreeRowInner({ row, lockable, lockTooltip, unlockTooltip, selected, onToggle, onLock, onSelect, onTooltipEnter, onTooltipLeave }: TreeRowProps): React.ReactElement {
    const indent = row.depth * INDENT_PX;
    const cellNameRef = useRef<HTMLTableCellElement>(null);

    useLayoutEffect(() => {
        if (cellNameRef.current) {
            cellNameRef.current.style.paddingLeft = `${indent + 4}px`;
        }
    }, [indent]);

    const rowClasses = ['row'];
    if (row.expanded) { rowClasses.push('expanded'); }
    if (lockable && row.locked) { rowClasses.push('locked'); }
    if (selected) { rowClasses.push('selected'); }

    const tooltip = buildTooltip(
        row.tooltipHead ?? (row.name || undefined),
        row.tooltipBody ?? (row.value || undefined),
    );

    function handleMouseEnter(e: React.MouseEvent) {
        if (tooltip) {
            onTooltipEnter(tooltip, e);
        }
    }

    function handleRowClick() {
        onSelect(row.id);
    }

    function handleToggleClick(e: React.MouseEvent) {
        e.stopPropagation();
        onToggle(row.id, !row.expanded);
    }

    function handleLockClick(e: React.MouseEvent) {
        e.stopPropagation();
        onLock(row.id);
    }

    const toggle = row.hasChildren
        ? (
            <span className="toggle" onClick={handleToggleClick}>
                <i className={`codicon ${row.expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
            </span>
        )
        : <span className="toggle-placeholder" />;

    const showLock = lockable && row.lockEnabled;
    const lockBtn = showLock
        ? row.locked
            ? (
                <span className="lock-btn" title={unlockTooltip} onClick={handleLockClick}>
                    <i className="codicon codicon-lock lock-icon-default" />
                    <i className="codicon codicon-unlock lock-icon-hover" />
                </span>
            )
            : (
                <span className="lock-btn" title={lockTooltip} onClick={handleLockClick}>
                    <i className="codicon codicon-lock" />
                </span>
            )
        : null;

    return (
        <tr
            className={rowClasses.join(' ')}
            data-row-id={row.id}
            onClick={handleRowClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={onTooltipLeave}
        >
            <td className="cell-name" ref={cellNameRef}>
                {toggle}<span className="name">{row.name}</span>
            </td>
            <td className="cell-value">
                {row.value}{lockBtn}
            </td>
        </tr>
    );
}

export const TreeRow = React.memo(TreeRowInner);
