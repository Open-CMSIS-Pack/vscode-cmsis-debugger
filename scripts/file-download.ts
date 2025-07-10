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

import { createWriteStream } from 'fs';
import https from 'https';

export type DownloadFile = (url: string, outputPath: string, token?: string) => Promise<void>;

export const downloadFile: DownloadFile = (url, outputPath, token?) => new Promise((resolve, reject) => {
    const requestOptions = {
        headers: {
            Accept: 'application/octet-stream',
            'User-Agent': 'vscode-cmsis-debugger',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    };

    const req = https.request(url, requestOptions, res => {
        if (res.statusCode !== undefined && (res.statusCode < 200 || res.statusCode >= 300)) {
            res.destroy();
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                return downloadFile(res.headers.location, outputPath, token).then(resolve, reject);
            }
            return reject(new Error(`Status Code: ${res.statusCode}`));
        }

        const writeStream = createWriteStream(outputPath);
        res.pipe(writeStream);

        writeStream.on('error', reject);

        writeStream.on('finish', () => {
            writeStream.close();
            resolve();
        });
    });

    req.on('error', reject);
    req.end();
});
