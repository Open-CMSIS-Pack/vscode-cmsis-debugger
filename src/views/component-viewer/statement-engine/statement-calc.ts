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
import { ScvdCalc } from '../model/scvd-calc';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementCalc extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    protected override async onExecute(_executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        const calcItem = this.scvdItem.castToDerived(ScvdCalc);
        if (!calcItem) {
            componentViewerLogger.error(`${this.line}: Executing "calc": could not cast to ScvdCalc`);
            return;
        }
        componentViewerLogger.debug(`${this.line}: Executing calc: ${await this.scvdItem.getGuiName()}`);

        const expressions = calcItem.expression;
        for (const expr of expressions) {
            const value = await expr.evaluate();
            componentViewerLogger.debug(`${this.line} Executing "calc": ${expr.expression}, value: ${value}`);
        }
    }
}
