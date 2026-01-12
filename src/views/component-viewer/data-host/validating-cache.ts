export interface ValidatingEntry<T> { value: T; valid: boolean; }

export class ValidatingCache<T> {
    private map = new Map<string, ValidatingEntry<T>>();

    public constructor(private normalize: (key: string) => string = (k) => k) {}

    public get(key: string): T | undefined {
        if (!key) return undefined;
        const norm = this.normalize(key);
        const entry = this.map.get(norm);
        return entry && entry.valid ? entry.value : undefined;
    }

    public getEntry(key: string): ValidatingEntry<T> | undefined {
        if (!key) return undefined;
        const norm = this.normalize(key);
        return this.map.get(norm);
    }

    public set(key: string, value: T, valid = true): void {
        if (!key) return;
        const norm = this.normalize(key);
        this.map.set(norm, { value, valid });
    }

    public invalidate(key: string): void {
        if (!key) return;
        const norm = this.normalize(key);
        const entry = this.map.get(norm);
        if (entry) {
            entry.valid = false;
            this.map.set(norm, entry);
        }
    }

    public invalidateAll(): void {
        this.map.forEach((entry, key) => {
            entry.valid = false;
            this.map.set(key, entry);
        });
    }

    public clear(): void {
        this.map.clear();
    }

    public delete(key: string): boolean {
        if (!key) return false;
        const norm = this.normalize(key);
        return this.map.delete(norm);
    }
}
