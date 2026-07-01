/**
 * Grasshopper-specific compute functionality
 *
 * This module provides both high-level and low-level APIs for working with
 * Grasshopper definitions and Rhino Compute servers.
 *
 * @example High-level usage
 * ```typescript
 * import { GrasshopperClient } from '@selvajs/compute/grasshopper';
 *
 * const client = new GrasshopperClient({ serverUrl: 'http://localhost:8081' });
 * const result = await client.solve(definitionUrl, dataTree);
 * ```
 *
 * @example Low-level usage
 * ```typescript
 * import { solveGrasshopperDefinition } from '@selvajs/compute/grasshopper';
 *
 * const result = await solveGrasshopperDefinition(dataTree, definition, {
 * 	serverUrl: 'http://localhost:8081'
 * });
 * ```
 *
 * @module grasshopper
 */

// ============================================================================
// CLIENT API (Recommended for most users)
// ============================================================================

export { GrasshopperResponseProcessor, GrasshopperClient } from './features/grasshopper';
export type { SolveOptions } from './features/grasshopper';

// ============================================================================
// SCHEDULER (Robust scheduling for solves — sliders, queues, caching)
// ============================================================================

export { SolveScheduler } from './features/grasshopper';
export type {
	SchedulerMode,
	CacheOptions,
	SolveSchedulerOptions,
	SolveContext,
	SolveResult
} from './features/grasshopper';

// ============================================================================
// COMPUTE FUNCTIONS (Low-level API)
// ============================================================================

export { solveGrasshopperDefinition } from './features/grasshopper';

// ============================================================================
// DEFINITION I/O (Get inputs and outputs from definitions)
// ============================================================================

export { fetchDefinitionIO, fetchParsedDefinitionIO } from './features/grasshopper';

// ============================================================================
// INPUT HELPERS (Convert data to DataTree format)
// ============================================================================

export { processInputs, processInput, TreeBuilder } from './features/grasshopper';
export type { DataTreeValue } from './features/grasshopper';

// ============================================================================
// FILE HANDLING (Extracting files from responses)
// ============================================================================

export { extractFilesFromComputeResponse, downloadFileData } from './features/grasshopper';
export type { ProcessedFile, FileData, FileBaseInfo } from './features/grasshopper';

// ============================================================================
// TYPE EXPORTS (Public types for this module)
// ============================================================================

export type {
	DataTreePath,
	DataItem,
	DataTree,
	DataTreeDefault,
	DefaultValue,
	InnerTreeData,
	GrasshopperParsedIO,
	GrasshopperParsedIORaw,
	GrasshopperRequestSchema,
	GrasshopperComputeResponse,
	GrasshopperComputeConfig,
	InputParam,
	NumericInputType,
	TextInputType,
	BooleanInputType,
	GeometryInputType,
	InputParamSchema,
	ValueListInputType,
	FileInputType,
	OutputParamSchema,
	OutputType
} from './features/grasshopper';

export type { GetValuesOptions, GetValuesResult, ParsedContext } from './features/grasshopper';

// ============================================================================
// CORE RE-EXPORTS
// ============================================================================

export { RhinoComputeError } from './core';
export type { ComputeConfig, RhinoModelUnit, RetryPolicy } from './core';
