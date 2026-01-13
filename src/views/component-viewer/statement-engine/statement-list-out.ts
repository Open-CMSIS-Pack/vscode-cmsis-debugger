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

import { ScvdBase } from '../model/scvd-base';
import { ScvdListOut } from '../model/scvd-list-out';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementListOut extends StatementBase {

    constructor(item: ScvdBase, parent: StatementBase | undefined) {
        super(item, parent);
    }

    public async executeStatement(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        const conditionResult = await this.scvdItem.getConditionResult();
        if (conditionResult === false) {
            //console.log(`${this.scvdItem.getLineNoStr()}: Skipping ${this.scvdItem.getDisplayLabel()} for condition result: ${conditionResult}`);
            return;
        }

        await this.onExecute(executionContext, guiTree);
        /*for (const child of this.children) {  // executed in list
            await child.executeStatement(executionContext, guiTree);
        }*/
    }

    protected async onExecute(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        const scvdList = this.scvdItem.castToDerived(ScvdListOut);
        if (scvdList === undefined) {
            console.error(`${this.line}: Executing "out-list": could not cast to ScvdList`);
            return;
        }
        //console.log(`${this.line}: Executing out-list: ${scvdList.name}`);

        const name = scvdList.name;
        if (name === undefined) {
            console.error(`${this.line}: Executing "out-list": no name defined`);
            return;
        }

        const startExpr = scvdList.start;
        if (startExpr === undefined) {
            console.error(`${this.line}: Executing "out-list": ${scvdList.name}, no start expression defined`);
            return;
        }
        const startValue = await startExpr.getValue();
        if (startValue === undefined) {
            console.error(`${this.line}: Executing "out-list": ${scvdList.name}, could not evaluate start expression`);
            return;
        }

        const modelBase = executionContext.evalContext.container.base;
        if (modelBase === undefined) {
            console.error(`${this.line}: Executing "out-list": ${scvdList.name}, no base container defined`);
            return;
        }

        const varItem = modelBase.getSymbol(name);
        if (varItem === undefined) {
            console.error(`${this.line}: Executing "out-list": ${scvdList.name}, could not find variable in base container: ${modelBase.name}`);
            return;
        }
        const varTargetSize = varItem.getTargetSize();
        if (varTargetSize === undefined) {
            console.error(`${this.line}: Executing "out-list": ${scvdList.name}, variable: ${varItem.name}, could not determine target size`);
            return;
        }

        let limitValue = 0;
        const limitExpr = scvdList.limit;
        if (limitExpr !== undefined) {
            const limitVal = await limitExpr.getValue();
            limitValue = limitVal !== undefined ? Number(limitVal) : 0; // do not enter loop if undefined
        }

        const whileExpr = scvdList.while;
        if (whileExpr !== undefined && limitExpr !== undefined) {
            console.error(`${this.line}: Executing "out-list": ${scvdList.name}, cannot define both limit and while expressions`);
            return;
        }

        let loopValue = Number(startValue);
        let maximumCount = 100000;   // prevent infinite loops
        while (maximumCount-- > 0) {
            executionContext.memoryHost.setVariable(name, varTargetSize, loopValue, 0, undefined, varTargetSize);    // update loop variable in memory

            /* while: Specifies the next value for iterations.
                When using attribute while, iteration does not start if start==0.
             */
            if (whileExpr !== undefined) {
                if (loopValue === 0) {
                    break;
                }
                const whileValue = await whileExpr.getValue();
                const whileNum = whileValue !== undefined ? Number(whileValue) : undefined;
                if (whileNum === 0 || whileNum === undefined) {   // break on read error too
                    break;
                }
            }
            if (limitExpr !== undefined) {
                if (loopValue >= limitValue) {
                    break;
                }
            }

            for (const child of this.children) {  // executed in list
                await child.executeStatement(executionContext, guiTree);
            }

            if (whileExpr !== undefined) {
                const whileValue = await whileExpr.getValue();
                if (whileValue !== undefined) {
                    loopValue = Number(whileValue);
                }
            }
            if (limitExpr !== undefined) {
                loopValue++;
            }
        }
        executionContext.memoryHost.setVariable(name, varTargetSize, loopValue, 0, undefined, varTargetSize);    // update last loop variable in memory
        return;
    }
}
