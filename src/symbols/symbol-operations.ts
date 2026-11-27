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

/** Rejects immediately if cancellation has already been requested. */
export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new DOMException('Symbol lookup cancelled.', 'AbortError');
    }
}

/** Cancels a caller's wait without interrupting a shared backend operation. */
export function waitForSymbolOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return operation;
    }
    return new Promise<T>((resolve, reject) => {
        const aborted = (): void => reject(new DOMException('Symbol lookup cancelled.', 'AbortError'));
        signal.addEventListener('abort', aborted, { once: true });
        operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
        if (signal.aborted) {
            aborted();
        }
    });
}

/** Bounds an operation in milliseconds and always releases the timeout handle. */
export async function withSymbolTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`Symbol operation timed out after ${milliseconds} ms.`)), milliseconds);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}
