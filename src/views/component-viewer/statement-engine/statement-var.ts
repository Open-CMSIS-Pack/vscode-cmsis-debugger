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

import { componentViewerLogger } from '../../../logger';
import { ScvdNode } from '../model/scvd-node';
import { ScvdVar } from '../model/scvd-var';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementVar extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    protected override async onExecute(executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        componentViewerLogger.debug(`Line: ${this.line}: Executing <${this.scvdItem.tag}> : ${await this.getGuiName()}`);

        const varItem = this.scvdItem.castToDerived(ScvdVar);
        if (varItem !== undefined) {
            const name = varItem.name;
            const elementSize = await varItem.getTargetSize();
            const count = await varItem.getArraySize();
            const targetSize = elementSize !== undefined ? elementSize * (count ?? 1) : undefined;
            const value = await varItem.getValue();
            if (name === undefined || targetSize === undefined) {
                componentViewerLogger.error(`Line: ${this.line}: Variable missing name or size.`);
                return;
            }

            const initValue = value ?? 0;
            executionContext.memoryHost.setVariable(name, targetSize, initValue, -1, 0);
            componentViewerLogger.debug(`Line: ${this.line}: Variable "${name}" created with value: ${value}`);
        }
    }
}
