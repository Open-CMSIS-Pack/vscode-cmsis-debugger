/**
 * Copyright 2025 Arm Limited
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

//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/
/** @type WebpackConfig */
const commonNode = {
    mode: 'development',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    externals: {
        vscode: 'commonjs vscode'
    }
};

/** @type WebpackConfig */
const webviewConfig = {
    mode: 'development',
    devtool: 'source-map',
    target: 'web',
    entry: {
        'webviews/tree-table': './src/webviews/tree-table/src/index.tsx'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, 'src/webviews/tree-table/tsconfig.json')
                    }
                },
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader']
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css'
        })
    ]
    // No vscode external — webviews run in the browser sandbox
};

/** @type WebpackConfig[] */
module.exports = [
    {
        ...commonNode,
        target: 'node',
        entry: {
            main: './src/desktop/extension.ts'
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'commonjs'
        },
        plugins: [
        ]
    },
    webviewConfig
];
