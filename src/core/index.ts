/**
 * Core utilities and configuration for rhino-compute-core
 *
 * This module provides low-level utilities, error handling, and configuration management.
 *
 * @example
 * ```typescript
 * import { normalizeComputeConfig, RhinoComputeError, ErrorCodes } from 'rhino-compute-core/core';
 *
 * const config = normalizeComputeConfig({ serverUrl: 'http://localhost:8081' });
 *
 * try {
 *   // ... some operation
 * } catch (error) {
 *   if (error instanceof RhinoComputeError && error.code === ErrorCodes.AUTH_ERROR) {
 *     console.error('Authentication failed');
 *   }
 * }
 * ```
 *
 * @module core
 */

// ============================================================================
// COMPUTE FETCH (Low-level HTTP client)
// ============================================================================

export { fetchRhinoCompute } from './compute-fetch/compute-fetch';

// =========================
// Server Stats
// =========================

export { ComputeServerStats } from './server';

// ============================================================================
// ERROR HANDLING
// ============================================================================

export { RhinoComputeError } from './errors/base';
export { ErrorCodes } from './errors/error-codes';
export type { ErrorCode } from './errors/error-codes';

// ============================================================================
// UTILITIES
// ============================================================================

// Logging
export type { Logger } from './utils/logger';
export { setLogger, enableDebugLogging, getLogger } from './utils/logger';

// Configuration
export type { ComputeConfig, RhinoModelUnit } from './types';


