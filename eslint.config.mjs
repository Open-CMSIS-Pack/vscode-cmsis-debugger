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

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: [
            "__mocks__/**/*",
            "coverage/**/*",
            "dist",
            "scripts",
            "**/*.d.ts",
            "*.config.{ts,js,mjs}",
            "*.setup.{ts,js}",
            "node_modules",
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts', '**/*.js'],
        plugins: {
            "@typescript-eslint": tseslint.plugin
        },
        languageOptions: {
            ecmaVersion: 9,
            sourceType: "module",
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: 9,
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    "argsIgnorePattern": "^_"
                }
            ],
            "block-spacing": [
                "error",
                "always"
            ],
            "brace-style": [
                "error",
                "1tbs",
                {
                    "allowSingleLine": true
                }
            ],
            "eol-last": [
                "error"
            ],
            "indent": [
                "error",
                4,
                {
                    "SwitchCase": 1
                }
            ],
            "linebreak-style": [
                "error",
                "unix"
            ],
            "no-trailing-spaces": [
                "error"
            ],
            "object-curly-spacing": [
                "error",
                "always"
            ],
            "quotes": [
                "error",
                "single"
            ],
            "semi": [
                "error",
                "always"
            ]
        },
    }
];
