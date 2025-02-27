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

import { makeFactory, StubEvents } from './test-data-factory';
import { Event, EventEmitter } from 'vscode';

describe('makeFactory', () => {

    it('returns default values when used without options', () => {
        type Type = {
            value: number;
            text: string;
        }

        const expected : Type = {
            value: 42,
            text: 'the answer'
        };

        const factory = makeFactory<Type>({
            value: () => expected.value,
            text: () => expected.text,
        });

        const value = factory();

        expect(value).toEqual(expected);
    });

    it('returns explicit values passed by options', () => {
        type Type = {
            value: number;
            text: string;
        }

        const expected : Type = {
            value: 42,
            text: 'the answer'
        };

        const factory = makeFactory<Type>({
            value: () => 43,
            text: () => expected.text,
        });

        const value = factory({ value: expected.value });

        expect(value).toEqual(expected);
    });

    it('stubs vscode.Event|s by exposing vscode.EventEmitter', () => {
        type Type = {
            event: Event<number>,
        }

        const factory = makeFactory<StubEvents<Type>>({
            eventEmitter: () => new EventEmitter(),
            event: (r) => jest.fn(r.eventEmitter?.event),
        });

        const value = factory();

        const listener = jest.fn();
        value.event(listener);
        value.eventEmitter.fire(42);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(42);
    });

});
