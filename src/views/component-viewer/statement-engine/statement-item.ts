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
 */

import { ScvdNode } from '../model/scvd-node';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';
import { StatementPrint } from './statement-print';
import { perf } from '../stats-config';
import { componentViewerLogger } from '../../../logger';


export class StatementItem extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    // TOIMPL: add printChildren to guiTree, and take the furst to set name/value for the item parent
    public override async executeStatement(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        componentViewerLogger.debug(`Line: ${this.line}: Executing statement: ${await this.getLogName()}`);
        const shouldExecute = await this.shouldExecute(executionContext);
        if (!shouldExecute) {
            return;
        }

        await this.onExecute(executionContext, guiTree);

        /* Example code for evaluating children.
           Normally this happens here, but in this case it’s done in onExecute
           to account for nameless item and print.

        for (const child of this.children) {  // executed in list
            await child.executeStatement(executionContext, guiTree);
        }*/
    }

    protected override async onExecute(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        componentViewerLogger.debug(`Line: ${this.line}: Executing <${this.scvdItem.tag}> : ${await this.getLogName()}`);

        const printChildren = this.children.filter((child): child is StatementPrint => child instanceof StatementPrint);

        // Determine the name and value for this item
        let guiName = '';
        let guiValue = '';

        if (printChildren.length > 0) {
            // Item uses print children for name/value - check if any print condition matches
            let matched = false;
            for (const printChild of printChildren) {
                const shouldPrint = await printChild.scvdItem.getConditionResult();
                if (shouldPrint !== false) {
                    guiName = await printChild.scvdItem.getGuiName() ?? '';
                    guiValue = await printChild.scvdItem.getGuiValue() ?? '';
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // No print matched - skip this entire item and its subtree
                return;
            }
        } else {
            // Item uses its own property/value attributes
            const guiNameStart = perf?.start() ?? 0;
            guiName = await this.getGuiName() ?? '';
            perf?.end(guiNameStart, 'guiNameMs', 'guiNameCalls');
            const guiValueStart = perf?.start() ?? 0;
            guiValue = await this.getGuiValue() ?? '';
            perf?.end(guiValueStart, 'guiValueMs', 'guiValueCalls');
        }

        // Create the GUI node
        const childGuiTree = this.getOrCreateGuiChild(guiTree, guiName);
        perf?.recordGuiItemNode();
        childGuiTree.setGuiName(guiName);
        childGuiTree.setGuiValue(guiValue);

        // Execute non-print children
        for (const child of this.children) {
            if (!(child instanceof StatementPrint)) {
                await child.executeStatement(executionContext, childGuiTree);
            }
        }

        // Remove item if it has statement children but no meaningful result:
        // - No value AND no GUI children after execution (e.g., "Drives" container with empty list)
        // - OR no name, no value, AND has children (e.g., empty Drive with Status child)
        const hasNonPrintChildren = this.children.some(child => !(child instanceof StatementPrint));
        const hasName = guiName.trim() !== '';
        const hasValue = guiValue.trim() !== '';

        if (hasNonPrintChildren) {
            // For containers: remove if no value and no GUI children
            if (!hasValue && !childGuiTree.hasGuiChildren()) {
                childGuiTree.detach();
            }
            // Also remove if no name, no value (even if it has GUI children that will display)
            else if (!hasName && !hasValue) {
                childGuiTree.detach();
            }
        }
    }
}
