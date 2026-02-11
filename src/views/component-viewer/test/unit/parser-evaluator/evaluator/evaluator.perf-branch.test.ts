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

import type { ASTNode, NumberLiteral } from '../../../../parser-evaluator/parser';
import type { EvalContext } from '../../../../parser-evaluator/evaluator';
import type { DataAccessHost, ModelHost } from '../../../../parser-evaluator/model-host';
import type { IntrinsicProvider } from '../../../../parser-evaluator/intrinsics';

describe('Evaluator perf optional chaining', () => {
    it('handles perf disappearing between timing calls', async () => {
        await jest.isolateModulesAsync(async () => {
            let perfEnabled = true;
            const perfObj = {
                start: jest.fn(() => 1),
                now: jest.fn(() => {
                    perfEnabled = false;
                    return 1;
                }),
                end: jest.fn(),
                recordEvalNodeKind: jest.fn(),
                beginEvalNodeFrame: jest.fn(),
                endEvalNodeFrame: jest.fn(),
                recordEvalNodeCacheHit: jest.fn(),
                recordEvalNodeCacheMiss: jest.fn(),
            };

            jest.doMock('../../../../stats-config', () => ({
                get perf() {
                    return perfEnabled ? perfObj : undefined;
                },
                parsePerf: undefined,
                targetReadStats: undefined,
                targetReadTimingStats: undefined,
            }));

            const { EvalContext } = await import('../../../../parser-evaluator/evaluator');
            const { TestEvaluator } = await import('../../helpers/test-evaluator');
            const { ScvdNode } = await import('../../../../model/scvd-node');

            class TestNode extends ScvdNode {
                constructor(name: string) {
                    super(undefined);
                    this.name = name;
                }

                public override getDisplayLabel(): string {
                    return this.name ?? '<anon>';
                }
            }

            const host: ModelHost & DataAccessHost & IntrinsicProvider = {
                getSymbolRef: jest.fn(async () => undefined),
                getMemberRef: jest.fn(async () => undefined),
                resolveColonPath: jest.fn(async () => undefined),
                getElementStride: jest.fn(async () => 0),
                getMemberOffset: jest.fn(async () => 0),
                getByteWidth: jest.fn(async () => 0),
                getElementRef: jest.fn(async () => undefined),
                getValueType: jest.fn(async () => undefined),
                readValue: jest.fn(async () => undefined),
                writeValue: jest.fn(async () => undefined),
                _count: jest.fn(async () => 0),
                _addr: jest.fn(async () => 0),
                __Running: jest.fn(async () => 1),
                __GetRegVal: jest.fn(async () => 0),
                __FindSymbol: jest.fn(async () => 0),
                __Symbol_exists: jest.fn(async () => 0),
                __size_of: jest.fn(async () => 0),
                __Offset_of: jest.fn(async () => 0),
                __CalcMemUsed: jest.fn(async () => 0),
            };

            const ctx: EvalContext = new EvalContext({ data: host, container: new TestNode('root') });
            const evaluator = new TestEvaluator();
            const evalNodeChild = (evaluator as unknown as {
                evalNodeChild: (node: ASTNode, ctx: EvalContext) => Promise<unknown>;
            }).evalNodeChild;

            const node: NumberLiteral = { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', start: 0, end: 1 };
            await expect(evalNodeChild.call(evaluator, node, ctx)).resolves.toBe(1);
        });
    });
});
