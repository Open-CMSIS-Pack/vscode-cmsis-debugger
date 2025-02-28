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

import { Event, EventEmitter } from 'vscode';

type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
}

type Factory<T> = (options?: Partial<T>) => Mutable<T>;

type Initializer<T> = {
    [P in keyof T]: (result: Partial<T>) => T[P]
};

export type StubEvents<T, S extends string = 'Emitter'> = {
    [P in keyof T as T[P] extends Event<unknown> ? `${string & P}${S}` : never]: T[P] extends Event<infer U> ? EventEmitter<U> : never
} & T;

export function makeFactory<T extends object>(initializer: Initializer<T>): Factory<T> {
    const factory = (options?: Partial<T>) => {
        const result = { ...options } as Mutable<T>;
        for (const key in initializer) {
            if (!(key in result)) {
                result[key] = initializer[key].call(result, result);
            }
        }
        return result;
    };
    return factory;
}

export function makeGenerator<T>(factory: Factory<T>) {
    return (count: number = 1, options?: Partial<T>): T[] => {
        return [...Array(count)].map(_ => factory(options));
    };
}
