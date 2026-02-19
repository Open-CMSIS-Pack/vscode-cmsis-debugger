/**
 * Copyright 2026 Arm Limited
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
// generated with AI

import type { ASTNode } from '../../../parser-evaluator/parser';
import type { EvalValue } from '../../../parser-evaluator/model-host';
import { EvalContext, Evaluator } from '../../../parser-evaluator/evaluator';

export class TestEvaluator extends Evaluator {
    public evalNodePublic(node: ASTNode, ctx: EvalContext): Promise<EvalValue> {
        return super.evalNode(node, ctx);
    }

    public getMessagesPublic(): string {
        return super.getMessages();
    }

    public getTestHelpersPublic(): Record<string, unknown> {
        return super.getTestHelpers();
    }
}
