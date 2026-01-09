/**
 * Copyright 2025 Arm Limited
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

import { ScvdBase } from '../model/scvd-base';
import { ScvdVar } from '../model/scvd-var';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementVar extends StatementBase {

    constructor(item: ScvdBase, parent: StatementBase | undefined) {
        super(item, parent);
    }

    protected async onExecute(executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        //console.log(`${this.line}: Executing var: ${await this.scvdItem.getGuiName()}`);

        const varItem = this.scvdItem.castToDerived(ScvdVar);
        if(varItem !== undefined) {
            const name = varItem.name;
            const targetSize = varItem.getTargetSize();
            const value = await varItem.getValue();
            if(name !== undefined && targetSize !== undefined && value !== undefined) {
                executionContext.memoryHost.setVariable(name, targetSize, value, -1, 0);
                //console.log(`${this.line} Variable "${name}" created with value: ${value}`);
            }
        }
    }
}
