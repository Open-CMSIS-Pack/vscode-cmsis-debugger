/**
 * Copyright 2025-2026 Arm Limited
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

import { Json } from './scvd-base';


export function AddText(text: string, addText: string | string[]): string {
    if (Array.isArray(addText)) {
        if (text.length) {
            return text + ' ' + addText.join(' ');
        }
        return addText.join(' ');
    }

    if (text.length) {
        return text + ' ' + addText;
    }
    return addText;
}

export function insertString(text: string, add: string, pos: number): string {
    if (pos === 0) {
        return add + text;
    }
    if (pos >= text.length) {
        return text + add;
    }

    return text.slice(0, pos) + add + text.slice(pos);
}

export function unsignedRShift(num: number, rShift: number) {
    return num >>> rShift;
}

export function clearSignBit(num: number) {
    return num >>> 0;
}

export function getObjectFromJson<T>(xml: T | undefined): T | undefined {
    return xml;
}

export function getStringFromJson(xml: Json): string | undefined {
    if (typeof xml === 'string') {
        return xml;
    }

    return undefined;
}

export function getArrayFromJson<T>(value: T | T[] | undefined): T[] | undefined {
    return value === undefined ? undefined : (Array.isArray(value) ? value : [value]);
}

// Extract raw text body (multiline) from the XML JSON object.
// Depending on the XML-to-JSON converter, text may reside in '#text', '_', or 'text'.
export function getTextBodyFromJson(xml: Json): string[] | undefined {
    const text: string | undefined = typeof xml === 'string'
        ? xml
        : (xml?.['#text'] ?? xml?._ ?? xml?.text);

    if (typeof text === 'string') {
        return text
            .split(/[;\r\n]+/)
            .map(l => l.trim())
            .filter(l => l.length > 0);
    }
    return undefined;
}

export function getLineNumberFromJson(xml: Json): string | undefined {
    const lineNo = xml?.['__line'];
    if (typeof lineNo === 'string') {
        return lineNo;
    }
    return undefined;
}
