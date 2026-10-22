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

import { findDependencyPullRequests } from './dependency-prs.js';

/** Release pins supply the allowed upstream repositories, independently of their versions. */
const PINS = {
    pyocd: 'pyocd/pyOCD@0.46.0',
    pyts: 'Open-CMSIS-Pack/pyTS@1.0.0',
    ctrace: 'Open-CMSIS-Pack/devtools@1.0.0',
};

describe('dependency PR links', () => {
    it('selects all supported tools from plain, Markdown and autolink URLs', () => {
        const warn = jest.fn();
        const body = [
            'Depends on https://github.com/pyocd/pyOCD/pull/12.',
            '[pyTS](https://github.com/Open-CMSIS-Pack/pyTS/pull/34)',
            '<https://github.com/Open-CMSIS-Pack/devtools/pull/56>',
        ].join('\n');
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({ pyocd: 12, pyts: 34, ctrace: 56 });
        expect(warn).not.toHaveBeenCalled();
    });

    it.each(['', '/', '/files', '/commits', '/checks', '#discussion_r123', '?diff=split', '/files#diff-123'])(
        'accepts PR URLs with suffix %s', suffix => {
            expect(findDependencyPullRequests(`https://github.com/Open-CMSIS-Pack/pyTS/pull/12${suffix}`, PINS, jest.fn()))
                .toEqual({ pyts: 12 });
        },
    );

    it.each([
        ['pyocd/pyOCD#12', { pyocd: 12 }],
        ['Open-CMSIS-Pack/pyTS#71', { pyts: 71 }],
        ['Open-CMSIS-Pack/devtools#56', { ctrace: 56 }],
        ['open-cmsis-pack/PYTS#71', { pyts: 71 }],
    ])('selects dependency PRs from GitHub shorthand references: %s', (reference, expected) => {
        const warn = jest.fn();
        expect(findDependencyPullRequests(`Depends on ${reference} for workflow verification`, PINS, warn)).toEqual(expected);
        expect(warn).not.toHaveBeenCalled();
    });

    it('deduplicates shorthand and full URLs referring to the same PR', () => {
        const warn = jest.fn();
        const body = 'Open-CMSIS-Pack/pyTS#71 and https://github.com/Open-CMSIS-Pack/pyTS/pull/71';
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({ pyts: 71 });
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns and uses nightly when shorthand and full URLs select different PRs', () => {
        const warn = jest.fn();
        const body = 'Open-CMSIS-Pack/pyTS#71 and https://github.com/Open-CMSIS-Pack/pyTS/pull/72';
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({});
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('Multiple dependency PRs linked for pyts (#71, #72); ignoring these links and using nightly selection.');
    });

    it('deduplicates links to the same PR, ignoring repository and hostname case', () => {
        const warn = jest.fn();
        const body = [
            'https://github.com/Open-CMSIS-Pack/pyTS/pull/12',
            'https://GITHUB.COM/open-cmsis-pack/PYTS/pull/12/files',
            'https://github.com/Open-CMSIS-Pack/pyTS/pull/12#discussion_r123',
        ].join('\n');
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({ pyts: 12 });
        expect(warn).not.toHaveBeenCalled();
    });

    it.each([
        '', 'No dependency PRs.',
        'unrelated/pyTS#12',
        'Open-CMSIS-Pack/pyTS#0',
        'Open-CMSIS-Pack/pyTS#-1',
        'Open-CMSIS-Pack/pyTS#01',
        'Open-CMSIS-Pack/pyTS#12abc',
        'Open-CMSIS-Pack/pyTS#12-extra',
        'other/Open-CMSIS-Pack/pyTS#12',
        'https://evil.example/Open-CMSIS-Pack/pyTS#12',
        'https://github.com/Open-CMSIS-Pack/pyTS#12',
        'https://github.com/unrelated/pyTS/pull/12',
        'https://github.com/Open-CMSIS-Pack/pyTS/issues/12',
        'https://github.com/Open-CMSIS-Pack/pyTS/pull/12abc',
        'https://github.com/Open-CMSIS-Pack/pyTS/pull/0',
        'https://github.com/Open-CMSIS-Pack/pyTS/pull/-1',
        'https://github.com/Open-CMSIS-Pack/pyTS/pull/01',
        'https://github.com.evil.example/Open-CMSIS-Pack/pyTS/pull/12',
        'https://github.com@evil.example/Open-CMSIS-Pack/pyTS/pull/12',
        'https://user@github.com/Open-CMSIS-Pack/pyTS/pull/12',
        'http://github.com/Open-CMSIS-Pack/pyTS/pull/12',
        'https://[invalid',
    ])('ignores descriptions without supported PR URLs: %s', body => {
        const warn = jest.fn();
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({});
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns and discards conflicting PRs for one tool while retaining other tools', () => {
        const warn = jest.fn();
        const body = [
            'https://github.com/Open-CMSIS-Pack/pyTS/pull/12',
            'https://github.com/Open-CMSIS-Pack/pyTS/pull/13',
            'https://github.com/Open-CMSIS-Pack/pyTS/pull/14',
            'https://github.com/Open-CMSIS-Pack/pyTS/pull/12/files',
            'https://github.com/pyocd/pyOCD/pull/34',
            'https://github.com/Open-CMSIS-Pack/devtools/pull/56',
        ].join('\n');
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({ pyocd: 34, ctrace: 56 });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('Multiple dependency PRs linked for pyts (#12, #13, #14); ignoring these links and using nightly selection.');
    });

    it('discards all overrides and warns for each tool when all links conflict', () => {
        const warn = jest.fn();
        const body = Object.values(PINS).flatMap(pin => [12, 13].map(number =>
            `https://github.com/${pin.split('@')[0]}/pull/${number}`)).join('\n');
        expect(findDependencyPullRequests(body, PINS, warn)).toEqual({});
        expect(warn).toHaveBeenCalledTimes(3);
    });

    it('uses the repositories configured in the release pins', () => {
        const body = 'https://github.com/other/pyTS/pull/12 https://github.com/Open-CMSIS-Pack/pyTS/pull/13';
        expect(findDependencyPullRequests(body, { ...PINS, pyts: 'other/pyTS@2.0.0' }, jest.fn())).toEqual({ pyts: 12 });
    });

    it('rejects a PR number that cannot be represented exactly', () => {
        expect(() => findDependencyPullRequests('https://github.com/Open-CMSIS-Pack/pyTS/pull/9007199254740993', PINS, jest.fn()))
            .toThrow('Invalid dependency PR number for pyts');
    });
});
