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

import * as utils from './scvd-utils';

export enum NumFormat {
    undefined = 0,
    decimal = 10,
    hexadecimal = 16,
    octal = 8,
    binary = 2,
    boolean = 1,
}

interface NumContainer {
    value: number;
    numFormat: NumFormat;
    displayFormat: NumFormat;
    numOfDigits: number;
    numOfDisplayBits: number;
    numMin?: number; // optional, used for min/max values
    numMax?: number; // optional, used for min/max values
}

export type NumberTypeInput = number | NumberType | string;

export class NumberType {
    private _value: NumContainer = {
        value: 0,
        numFormat: NumFormat.undefined,
        displayFormat: NumFormat.undefined,
        numOfDigits: 1,
        numOfDisplayBits: 1
    };

    constructor(val?: NumberTypeInput, numFormat?: NumFormat, numOfDisplayBits?: number) {

        if (typeof val === 'number') {
            this._value.value = val;
            if (numFormat !== undefined) {
                this._value.numFormat = numFormat;
            } else {
                this._value.numFormat = NumFormat.decimal;
            }
            this._value.displayFormat = this._value.numFormat;
            if ( numOfDisplayBits !== undefined) {
                this._value.numOfDisplayBits = numOfDisplayBits;
            }
        } else if (val instanceof NumberType) {
            this._value = { value: val.value, numFormat: val.format, displayFormat: val.displayFormat, numOfDigits: val._value.numOfDigits, numOfDisplayBits: val._value.numOfDisplayBits };
        } else if (typeof val === 'string') {
            this._value = this.toNumber(val);
        }
    }

    public get numOfDigits() {
        return this._value.numOfDigits;
    }
    public set numOfDigits(value: number) {
        if (value < 1) {
            value = 1;
        }
        this._value.numOfDigits = value;
    }

    public get numOfDisplayBits() {
        return this._value.numOfDisplayBits;
    }
    public set numOfDisplayBits(value: number) {
        if (value < 1) {
            value = 1;
        }
        this._value.numOfDisplayBits = value;
    }

    protected toNumber(value: string): NumContainer {
        let val = value.toLowerCase();
        const num: NumContainer = { value: 0, numFormat: NumFormat.undefined, displayFormat: NumFormat.undefined, numOfDigits: 1, numOfDisplayBits: 1 };
        let pos = 0;
        let isNegative = false;
        if (val[0] == '-') {
            val = val.substring(1);
            isNegative = true;
        }

        // positive values in num-string from here
        if (val == '') {
            num.numFormat = NumFormat.undefined;
        } else if (val == 'true') {
            num.numFormat = NumFormat.boolean;
            num.value = 1;
        } else if (val == 'false') {
            num.numFormat = NumFormat.boolean;
            num.value = 0;
        } else if (val.match(/^0x\d*/i)) {
            num.numFormat = NumFormat.hexadecimal;
            num.numOfDigits = val.length - 2;
            pos = 2;
        } else if (val.match(/^0b\d*/i)) {
            num.numFormat = NumFormat.binary;
            num.numOfDigits = val.length - 2;
            pos = 2;
        } else if (val.match(/^0\d*/) && val.length > 1) {
            num.numFormat = NumFormat.octal;
            pos = 1;
        } else if (val.match(/^\d*/) && val.length == 1) {
            num.numFormat = NumFormat.decimal;
        } else if (val.match(/^[1-9]\d*/)) {
            num.numFormat = NumFormat.decimal;
        } else {
            num.numFormat = NumFormat.undefined;
        }

        if (num.numFormat == NumFormat.undefined) {  // error, try as decimal
            num.numFormat = NumFormat.decimal;
        }
        if (num.displayFormat == NumFormat.undefined) {  // not set, use original format
            num.displayFormat = num.numFormat;
        }

        if (num.numOfDigits < 1) {
            num.numOfDigits = 1;
        }

        if (num.numFormat != NumFormat.boolean) {    // boolean set above
            const tmp = parseInt(val.substring(pos), num.numFormat) * ((isNegative) ? -1 : 1);
            if (isNaN(tmp)) {
                num.numFormat = NumFormat.undefined;
            } else {
                num.value = tmp;
            }
        }

        return num;
    }

    public get value(): number {
        if (this._value.numMin && this._value.value < this._value.numMin) {
            return this._value.numMin;
        } else if (this._value.numMax && this._value.value > this._value.numMax) {
            return this._value.numMax;
        }

        return this._value.value;
    }

    public set value(val: number | NumberType | string) {
        if (typeof val === 'number') {
            this._value.value = val;
            if (this._value.numFormat == NumFormat.undefined) {
                this._value.numFormat = NumFormat.decimal;
                this._value.displayFormat = NumFormat.decimal;
            }
        } else if (val instanceof NumberType) {
            this._value = { value: val._value.value, numFormat: val.format, displayFormat: val.displayFormat, numOfDigits: val._value.numOfDigits, numOfDisplayBits: val._value.numOfDisplayBits };
        } else if (typeof val === 'string') {
            this._value = this.toNumber(val);
        }
    }

    public get format(): NumFormat {
        return this._value.numFormat;
    }
    public set format(format: NumFormat) {
        this._value.numFormat = format;
    }
    public get displayFormat(): NumFormat {
        return this._value.displayFormat;
    }
    public set displayFormat(format: NumFormat) {
        this._value.displayFormat = format;
    }
    public isValid(): boolean {
        return this._value.numFormat != NumFormat.undefined;
    }

    public getText() {
        return this.getValStrByFormat(this.format, this._value.numOfDigits);
    }

    public getValStrByFormat(format: NumFormat, digits: number) {
        if (format == NumFormat.undefined) {
            const tmp = this.value.toString(NumFormat.decimal);
            return tmp.toUpperCase();
        }

        let val = this.value;
        let negative = false;
        if (val < 0) {
            negative = true;
            val *= -1;
        }

        let text = '';
        if (format == NumFormat.boolean) {
            switch (val) {
                case 0:
                    text = 'false';
                    break;
                case 1:
                default:
                    text = 'true';
                    break;
            }
        } else {
            text = val.toString(format);
        }

        if (!text.length) {
            const tmp = this.value.toString(NumFormat.decimal);
            return tmp.toUpperCase();
        }

        if (format != NumFormat.boolean) {
            text = text.toUpperCase();
        }

        if (digits < 1) {
            digits = 1;
        }
        text = text.padStart(digits, '0');

        let pos = 0;
        if (negative) {
            pos = 1;
            text = '-' + text;
        }

        text = utils.insertString(text, this.getFormatPrefix(format), pos);

        return text;
    }


    public getDisplayText() {
        if (this.displayFormat == NumFormat.undefined) {
            return this.getValStrByFormat(NumFormat.decimal, 1);
        }

        let displayDigits = this._value.numOfDisplayBits;
        switch (this._value.displayFormat) {
            case NumFormat.hexadecimal:
                displayDigits /= 4;  // 4 bits per nibble
                break;
            case NumFormat.decimal:
                displayDigits = 1;  // print as required
                break;
            case NumFormat.octal:
                displayDigits /= 3 ;  // 3 bits per number
        }

        if (displayDigits < 1) {
            displayDigits = 1;
        } else if (displayDigits % 1) {
            displayDigits++;
        }

        const text = this.getValStrByFormat(this.displayFormat, displayDigits);

        return text;
    }

    public getFormatPrefix(format: NumFormat) {
        switch (format) {
            case NumFormat.decimal:
                return '';
            case NumFormat.hexadecimal:
                return '0x';
            case NumFormat.octal:
                return '0';
            case NumFormat.binary:
                return '0b';
            case NumFormat.undefined:
            default:
                return '';
        }
    }

    public getFormatText(format: NumFormat) {
        let text = '';
        switch (format) {
            case NumFormat.decimal: {
                text += 'decimal';
            } break;
            case NumFormat.hexadecimal: {
                text += 'hexadecimal';
            } break;
            case NumFormat.octal: {
                text += 'octal';
            } break;
            case NumFormat.binary: {
                text += 'binary';
            } break;
            case NumFormat.boolean: {
                text += 'boolean';
            } break;
            default:
            case NumFormat.undefined: {
                text += 'undefined';
            } break;
        }

        return text;
    }

    public setMin(min: number) {
        this._value.numMin = min;
    }

    public setMax(max: number) {
        this._value.numMax = max;
    }

    public get min(): number | undefined {
        return this._value.numMin;
    }

    public get max(): number | undefined {
        return this._value.numMax;
    }

    public setMinMax(min: number | undefined, max: number | undefined) {
        if (min !== undefined) {
            this._value.numMin = min;
        }
        if (max !== undefined) {
            this._value.numMax = max;
        }
    }

    public getMinMax(): { min: number | undefined; max: number | undefined } {
        return { min: this._value.numMin, max: this._value.numMax };
    }

}

