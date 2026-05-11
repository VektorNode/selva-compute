/**
 * Core utilities and configuration for @selvajs/compute
 *
 * This module provides the foundational building blocks for the library, including:
 * - **Networking**: Type-safe HTTP wrappers for the Rhino Compute API
 * - **Server Monitoring**: Health checks and telemetry monitoring
 * - **Error Handling**: Specialized error classes for API and network failures
 * - **Logging**: Configurable debug and production logging
 *
 * @example Performing a low-level compute request
 * ```typescript
 * import { fetchRhinoCompute, RhinoComputeError } from '@selvajs/compute/core';
 *
 * try {
 *   const data = await fetchRhinoCompute('rhino/health', null, config);
 *   console.log('Server is healthy:', data);
 * } catch (error) {
 *   if (error instanceof RhinoComputeError) {
 *     console.error(`API Error [${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 *
 * @example Monitoring server status
 * ```typescript
 * import { ComputeServerStats } from '@selvajs/compute/core';
 *
 * const stats = new ComputeServerStats(serverUrl, apiKey);
 * if (await stats.isServerOnline()) {
 *   const info = await stats.getServerStats();
 *   console.log(`Compute Version: ${info.version}`);
 * }
 * await stats.dispose();
 * ```
 *
 * @module core
 */

// ============================================================================
// COMPUTE FETCH (Low-level HTTP client)
// ============================================================================

export { fetchRhinoCompute } from './compute-fetch/compute-fetch';

// ============================================================================
// SERVER STATS
// ============================================================================

export { default as ComputeServerStats } from './server/compute-server-stats';

// ============================================================================
// ERROR HANDLING
// ============================================================================

export { RhinoComputeError, ErrorCodes } from './errors';
export type { ErrorCode } from './errors';

// ============================================================================
// UTILITIES
// ============================================================================

// Logging
export type { Logger } from './utils/logger';
export { setLogger, enableDebugLogging, getLogger } from './utils/logger';

// Configuration
export type { ComputeConfig, RhinoModelUnit, RetryPolicy } from './types';

// String utilities
export { toCamelCase, camelcaseKeys } from './utils/camel-case';
