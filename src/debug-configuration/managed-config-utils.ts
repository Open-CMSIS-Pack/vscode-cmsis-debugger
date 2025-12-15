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

const DEBUG_CONFIG_REQTYPES = [ '(launch)', '(attach)' ];

/**
 * Check if configuration name ends with typical ending for CMSIS managed debug configs.
 *
 * @param configName debug configuration name
 * @returns true if configuration name ends with managed config type endings
 */
export const hasManagedConfigEnding = (configName: string): boolean => DEBUG_CONFIG_REQTYPES.some(req => configName.endsWith(req));

/**
 * Get base name of managed configuration by removing the request type ending.
 *
 * @param configName debug configuration name
 * @returns base name of managed configuration
 */
export const getManagedConfigBaseName = (configName: string): string => (configName.split(' ').slice(0, -1).join(' '));
