/**
 * Copyright (C) 2024 Arm Limited
 */

import { createWriteStream } from 'fs';
import https from 'https';

export type DownloadFile = (url: string, outputPath: string, token?: string) => Promise<void>;

export const downloadFile: DownloadFile = (url, outputPath, token?) => new Promise((resolve, reject) => {
    const requestOptions = {
        headers: {
            Accept: 'application/octet-stream',
            'User-Agent': 'Arm-Debug',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    };

    const req = https.request(url, requestOptions, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            return downloadFile(res.headers.location, outputPath, token).then(resolve, reject);
        }

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
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
