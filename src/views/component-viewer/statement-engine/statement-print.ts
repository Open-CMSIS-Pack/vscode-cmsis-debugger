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
import { perf } from '../stats-config';
import { componentViewerLogger } from '../../../logger';


export class StatementPrint extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    public override async executeStatement(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        const shouldExecute = await this.shouldExecute(executionContext);
        if (!shouldExecute) {
            return;
        }

        const guiNameStart = perf?.start() ?? 0;
        const guiName = await this.getGuiName();
        perf?.end(guiNameStart, 'guiNameMs', 'guiNameCalls');
        const guiValueStart = perf?.start() ?? 0;
        const guiValue = await this.getGuiValue();
        perf?.end(guiValueStart, 'guiValueMs', 'guiValueCalls');
        const childGuiTree = this.getOrCreateGuiChild(guiTree, guiName);
        perf?.recordGuiPrintNode();
        childGuiTree.setGuiName(guiName);
        childGuiTree.setGuiValue(guiValue);
        childGuiTree.isPrint = true;

        await this.onExecute(executionContext, childGuiTree);

        if (this.children.length > 0) {
            for (const child of this.children) {
                await child.executeStatement(executionContext, childGuiTree);
            }
        }
    }

    protected override async onExecute(_executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        componentViewerLogger.debug(`${this.line}: Executing print: ${await this.scvdItem.getGuiName()}`);
    }
}
