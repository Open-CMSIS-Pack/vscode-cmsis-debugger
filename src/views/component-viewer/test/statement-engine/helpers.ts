/**
 * Test helpers for statement-engine coverage.
 */
import { EvalContext } from '../../evaluator';
import type { ExecutionContext } from '../../scvd-eval-context';
import { MemoryHost } from '../../data-host/memory-host';
import { RegisterHost } from '../../data-host/register-host';
import type { ScvdDebugTarget } from '../../scvd-debug-target';
import { ScvdNode } from '../../model/scvd-node';

export class TestNode extends ScvdNode {
    private _conditionResult: boolean;
    private _guiName: string | undefined;
    private _guiValue: string | undefined;

    constructor(
        parent: ScvdNode | undefined,
        opts?: {
            conditionResult?: boolean;
            guiName?: string;
            guiValue?: string;
        }
    ) {
        super(parent);
        this._conditionResult = opts?.conditionResult ?? true;
        this._guiName = opts?.guiName;
        this._guiValue = opts?.guiValue;
    }

    public override async getConditionResult(): Promise<boolean> {
        return this._conditionResult;
    }

    public override async getGuiName(): Promise<string | undefined> {
        return this._guiName;
    }

    public override async getGuiValue(): Promise<string | undefined> {
        return this._guiValue;
    }

    public set conditionResult(value: boolean) {
        this._conditionResult = value;
    }

    public set guiName(value: string | undefined) {
        this._guiName = value;
    }

    public set guiValue(value: string | undefined) {
        this._guiValue = value;
    }
}

export function createExecutionContext(
    base: ScvdNode,
    debugTargetOverrides?: Partial<ScvdDebugTarget>
): ExecutionContext {
    const memoryHost = new MemoryHost();
    const registerHost = new RegisterHost();
    const evalContext = new EvalContext({
        data: {} as never,
        container: base,
    });
    const debugTargetDefaults: Partial<ScvdDebugTarget> = {
        findSymbolAddress: async () => undefined,
        getNumArrayElements: async () => undefined,
        readMemory: async () => undefined,
    };
    const debugTarget = { ...debugTargetDefaults, ...debugTargetOverrides } as ScvdDebugTarget;

    return {
        memoryHost,
        registerHost,
        evalContext,
        debugTarget,
    };
}
