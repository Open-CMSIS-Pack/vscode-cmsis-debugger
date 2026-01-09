import { EvalContext, evaluateParseResult, type DataHost, type RefContainer, type EvalValue } from '../../evaluator';
import { parseExpression } from '../../parser';
import { ScvdBase } from '../../model/scvd-base';

class BasicRef extends ScvdBase {
    constructor(parent?: ScvdBase) {
        super(parent);
    }
}

class HookHost implements DataHost {
    readonly root = new BasicRef();
    readonly arrRef = new BasicRef(this.root);
    readonly elemRef = new BasicRef(this.arrRef);
    readonly fieldRef = new BasicRef(this.elemRef);
    lastFormattingContainer: RefContainer | undefined;

    private readonly values = new Map<number, EvalValue>([
        [10, 99], // offsetBytes for arr[2].field
        [6, 0xab], // offsetBytes for arr[1].field in printf path
    ]);

    calls: Record<string, number> = {};

    private tick(name: string) {
        this.calls[name] = (this.calls[name] ?? 0) + 1;
    }

    getSymbolRef(_container: RefContainer, name: string): BasicRef | undefined {
        this.tick('getSymbolRef');
        if (name === 'arr') return this.arrRef;
        return undefined;
    }

    getMemberRef(container: RefContainer, property: string): BasicRef | undefined {
        this.tick('getMemberRef');
        if (property === 'field') return this.fieldRef;
        // allow colon-path anchor to succeed
        if (property === 'dummy') return this.fieldRef;
        return undefined;
    }

    getElementStride(): number {
        this.tick('getElementStride');
        return 4;
    }

    getMemberOffset(): number {
        this.tick('getMemberOffset');
        return 2;
    }

    getElementRef(): BasicRef {
        this.tick('getElementRef');
        return this.elemRef;
    }

    getByteWidth(): number {
        this.tick('getByteWidth');
        return 4;
    }

    resolveColonPath(_container: RefContainer, parts: string[]): EvalValue {
        this.tick('resolveColonPath');
        return parts.length * 100; // simple sentinel
    }

    readValue(container: RefContainer): EvalValue | undefined {
        this.tick('readValue');
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    }

    writeValue(_container: RefContainer, value: EvalValue): EvalValue | undefined {
        this.tick('writeValue');
        return value;
    }

    formatPrintf(spec: string, value: EvalValue, container: RefContainer): string {
        this.tick('formatPrintf');
        this.lastFormattingContainer = container;
        return `fmt-${spec}-${value}`;
    }
}

describe('evaluator data host hooks', () => {
    it('uses stride/offset/element helpers for array member reads', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('arr[2].field', false);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe(99);
        expect(host.calls.getElementStride).toBe(1);
        expect(host.calls.getElementRef).toBe(1);
        expect(host.calls.getMemberOffset).toBe(1);
        expect(host.calls.getByteWidth).toBeGreaterThanOrEqual(1);
    });

    it('calls resolveColonPath for colon expressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('foo:bar:baz', false);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe(300); // 3 parts * 100
        expect(host.calls.resolveColonPath).toBe(1);
    });

    it('honors printf formatting override', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field]', true);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe('val=fmt-x-171');
        expect(host.calls.formatPrintf).toBe(1);
    });

    it('recovers reference containers for printf subexpressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field + 1]', true);

        await evaluateParseResult(pr, ctx);
        expect(host.calls.formatPrintf).toBe(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('does not recover containers for constant-only branches', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[false ? arr[1].field : 5]', true);

        await evaluateParseResult(pr, ctx);
        expect(host.calls.formatPrintf).toBe(1);
        expect(host.lastFormattingContainer?.current).toBeUndefined();
    });
});
