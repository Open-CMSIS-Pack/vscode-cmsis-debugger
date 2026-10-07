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

/**
 * Unit test for StatementCalc.
 */

import { parseStringPromise } from 'xml2js';

import { componentViewerLogger } from '../../../../../logger';
import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { ScvdEvalContext } from '../../../scvd-eval-context';
import { Json } from '../../../model/scvd-base';
import { ScvdCalc } from '../../../model/scvd-calc';
import { ScvdComponentViewer } from '../../../model/scvd-component-viewer';
import { StatementCalc } from '../../../statement-engine/statement-calc';
import { StatementVar } from '../../../statement-engine/statement-var';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

async function createCalcFixture(objectBody: string) {
    const xml: Json = await parseStringPromise(`
        <component_viewer>
            <objects>
                <object name="TestCaseObject">${objectBody}</object>
            </objects>
        </component_viewer>`, {
        explicitArray: false,
        mergeAttrs: true,
        explicitRoot: true,
        trim: true,
        explicitChildren: true,
        preserveChildrenOrder: true,
    });
    const viewer = new ScvdComponentViewer(undefined);
    expect(viewer.readXml(xml)).toBe(true);
    const ctx = new ScvdEvalContext(viewer).getExecutionContext();
    viewer.setExecutionContextAll(ctx);
    viewer.configureAll();
    const object = viewer.objects?.objects[0];
    const calc = object?.children.find(child => child instanceof ScvdCalc);
    if (object === undefined || calc === undefined) {
        throw new Error('Expected the test case to contain an object and calc');
    }
    const guiTree = new ScvdGuiTree(undefined);
    const stmt = new StatementCalc(calc, undefined);
    for (const variable of object.var) {
        await new StatementVar(variable, undefined).executeStatement(ctx, guiTree);
    }
    return { viewer, ctx, calc, stmt, guiTree };
}

describe('StatementCalc', () => {
    it('logs when cast to calc fails', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementCalc(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('evaluates calc expressions', async () => {
        const calc = new ScvdCalc(undefined);
        const exprA = { evaluate: jest.fn().mockResolvedValue(1) };
        const exprB = { evaluate: jest.fn().mockResolvedValue(2) };
        (calc as unknown as { _expression: Array<{ evaluate: () => Promise<number> }> })._expression = [
            exprA,
            exprB,
        ];

        const stmt = new StatementCalc(calc, undefined);
        const ctx = createExecutionContext(calc);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(exprA.evaluate).toHaveBeenCalled();
        expect(exprB.evaluate).toHaveBeenCalled();
    });

    it.each([
        { expression: '0', value: 0 },
        { expression: '""', value: '' },
    ])('logs successful evaluation of $expression', async ({ expression, value }) => {
        const calc = new ScvdCalc(undefined);
        calc.readXml({ '#name': 'calc', '#text': expression });
        const ctx = createExecutionContext(calc);
        calc.setExecutionContext(ctx);
        calc.expression.forEach(expr => expr.configure());
        const stmt = new StatementCalc(calc, undefined);
        const guiTree = new ScvdGuiTree(undefined);
        const debugSpy = jest.spyOn(componentViewerLogger, 'debug').mockImplementation(() => undefined);

        try {
            await stmt.executeStatement(ctx, guiTree);

            expect(debugSpy).toHaveBeenCalledWith(
                `Line: 0: Completed executing <calc>, ${expression}, value: ${value}`
            );
            expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Failed executing'));
        } finally {
            debugSpy.mockRestore();
        }
    });

    it('reports the original calc parse error once and skips it until corrected', async () => {
        const { viewer, ctx, calc, stmt, guiTree } = await createCalcFixture(`
            <var name="TestVariable" type="uint32_t" value="3"/>
            <var name="TestBit0" type="uint8_t" value="0"/>
            <var name="TestBit1" type="uint8_t" value="0"/>
            <var name="AfterError" type="uint8_t" value="0"/>
            <calc __line="9">
                TestBit0=(TestVariable&gt;&gt;0)&amp;0x1;
                TestBit1=(TestVariable&gt;&gt;1)&amp;0x1:
                AfterError+=1;
            </calc>`);
        const invalidExpression = 'TestBit1=(TestVariable>>1)&0x1:';
        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => undefined);
        const debugSpy = jest.spyOn(componentViewerLogger, 'debug').mockImplementation(() => undefined);
        const writeSpy = jest.spyOn(ctx.memoryHost, 'write');

        try {
            viewer.validateAll(true);

            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[Line: 9 '));
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(
                `Invalid expression "${invalidExpression}": Extra tokens after expression at position 31: ":"`
            ));

            for (const attempt of [1, 2]) {
                errorSpy.mockClear();
                debugSpy.mockClear();
                writeSpy.mockClear();

                await stmt.executeStatement(ctx, guiTree);

                expect(errorSpy).not.toHaveBeenCalled();
                expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[Line: 9 '));
                expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining(
                    `Skipping invalid expression "${invalidExpression}": Extra tokens after expression at position 31: ":"`
                ));
                expect(ctx.memoryHost.read('TestBit0', 0, 1)).toEqual(new Uint8Array([1]));
                expect(ctx.memoryHost.read('TestBit1', 0, 1)).toEqual(new Uint8Array([0]));
                expect(ctx.memoryHost.read('AfterError', 0, 1)).toEqual(new Uint8Array([attempt]));
                expect(writeSpy.mock.calls.map(([name]) => name)).toEqual(['TestBit0', 'AfterError']);
                expect(debugSpy).toHaveBeenCalledWith(
                    'Line: 9: Completed executing <calc>, TestBit0=(TestVariable>>0)&0x1, value: 1'
                );
                expect(debugSpy).toHaveBeenCalledWith(
                    `Line: 9: Completed executing <calc>, AfterError+=1, value: ${attempt}`
                );
                expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining(
                    `Completed executing <calc>, ${invalidExpression}`
                ));
                expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining(
                    `Failed executing <calc>, ${invalidExpression}`
                ));
            }

            const expression = calc.expression.find(expr => expr.expression === invalidExpression);
            if (expression === undefined) {
                throw new Error('Expected the original invalid expression to be present');
            }
            const correctedExpression = 'TestBit1=(TestVariable>>1)&0x1;';
            expression.expression = correctedExpression;
            expression.configure();
            errorSpy.mockClear();
            debugSpy.mockClear();
            writeSpy.mockClear();

            await stmt.executeStatement(ctx, guiTree);

            expect(ctx.memoryHost.read('TestBit1', 0, 1)).toEqual(new Uint8Array([1]));
            expect(writeSpy.mock.calls.map(([name]) => name)).toEqual(['TestBit0', 'TestBit1', 'AfterError']);
            expect(errorSpy).not.toHaveBeenCalled();
            expect(debugSpy).toHaveBeenCalledWith(
                `Line: 9: Completed executing <calc>, ${correctedExpression}, value: 1`
            );
            expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Failed executing'));
            expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipping invalid expression'));
        } finally {
            writeSpy.mockRestore();
            debugSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('retries dynamic evaluation failures and recovers when the runtime value changes', async () => {
        const { viewer, ctx, stmt, guiTree } = await createCalcFixture(`
            <var name="TestVariable" type="uint32_t" value="0"/>
            <var name="TestBit1" type="uint8_t" value="0"/>
            <calc __line="9">TestBit1=3/TestVariable;</calc>`);
        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => undefined);
        const debugSpy = jest.spyOn(componentViewerLogger, 'debug').mockImplementation(() => undefined);
        const writeSpy = jest.spyOn(ctx.memoryHost, 'write');

        try {
            viewer.validateAll(true);
            expect(errorSpy).not.toHaveBeenCalled();

            for (const divisor of [0, 0, 3]) {
                ctx.memoryHost.setVariable('TestVariable', 4, divisor, 0);
                errorSpy.mockClear();
                debugSpy.mockClear();
                writeSpy.mockClear();

                await stmt.executeStatement(ctx, guiTree);

                expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipping invalid expression'));
                if (divisor === 0) {
                    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Division by zero'));
                    expect(writeSpy).not.toHaveBeenCalled();
                    expect(ctx.memoryHost.read('TestBit1', 0, 1)).toEqual(new Uint8Array([0]));
                    expect(debugSpy).toHaveBeenCalledWith(
                        'Line: 9: Failed executing <calc>, TestBit1=3/TestVariable'
                    );
                    expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Completed executing <calc>'));
                } else {
                    expect(errorSpy).not.toHaveBeenCalled();
                    expect(writeSpy.mock.calls.map(([name]) => name)).toEqual(['TestBit1']);
                    expect(ctx.memoryHost.read('TestBit1', 0, 1)).toEqual(new Uint8Array([1]));
                    expect(debugSpy).toHaveBeenCalledWith(
                        'Line: 9: Completed executing <calc>, TestBit1=3/TestVariable, value: 1'
                    );
                    expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Failed executing'));
                }
            }
        } finally {
            writeSpy.mockRestore();
            debugSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });
});
