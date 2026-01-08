import { ScvdGuiInterface } from './model/scvd-gui-interface';


export class ScvdGuiTree implements ScvdGuiInterface {
    private _parent: ScvdGuiTree | undefined;
    private _nodeId: string;
    private _name: string | undefined;
    private _value: string | undefined;
    private _children: ScvdGuiTree[] = [];
    private _isPrint: boolean = false;
    private static idCnt: number = 0;

    constructor(
        parent: ScvdGuiTree | undefined,
    ) {
        this._parent = parent;
        if(parent) {
            parent.addChild(this);
        }
        this._nodeId = ScvdGuiTree.idCnt.toString();
        ScvdGuiTree.idCnt++;
    }

    public get parent(): ScvdGuiTree | undefined {
        return this._parent;
    }

    get classname(): string {
        return this.constructor.name;
    }

    get nodeId(): string {
        return this.classname + '_' + this._nodeId.toString();
    }

    public clear(): void {
        this._children = [];
    }

    public get isPrint(): boolean {
        return this._isPrint;
    }
    public set isPrint(value: boolean) {
        this._isPrint = value;
    }

    private set name(value: string | undefined) {
        this._name = value;
    }
    public get name(): string | undefined {
        return this._name;
    }

    public get value(): string | undefined {
        return this._value;
    }

    public get children(): ScvdGuiTree[] {
        return this._children;
    }

    protected addChild(child: ScvdGuiTree): void {
        this._children.push(child);
    }

    public detach(): void {
        if(!this._parent) {
            return;
        }
        this._parent._children = this._parent._children.filter(child => child !== this);
        this._parent = undefined;
    }

    public setGuiName(value: string | undefined) {
        this._name = value;
    }

    public setGuiValue(value: string | undefined) {
        this._value = value;
    }

    // --------  ScvdGuiInterface methods --------
    getGuiEntry(): { name: string | undefined; value: string | undefined } {
        return { name: this._name, value: this._value };
    }

    getGuiChildren(): ScvdGuiInterface[] {
        return this.children;
    }

    getGuiName(): string | undefined {
        return this.name;
    }

    getGuiValue(): string | undefined {
        return this.value;
    }

    getGuiConditionResult(): boolean {
        return true;
    }

    getGuiLineInfo(): string | undefined {
        return undefined;
    }

    hasGuiChildren(): boolean {
        return this._children.length > 0;
    }
    // --------  ScvdGuiInterface methods --------


}
