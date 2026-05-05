/**
 * Grasshopper computation and I/O processing
 *
 * This module provides client APIs and utilities for working with
 * Grasshopper definitions and Rhino Compute.
 */

// ============================================================================
// CLIENT API (Recommended)
// ============================================================================
export { default as GrasshopperClient } from './client/grasshopper-client';
export type { SolveOptions } from './client/grasshopper-client';
export { default as GrasshopperResponseProcessor } from './client/grasshopper-response-processor';

// ============================================================================
// SCHEDULER
// ============================================================================
export { SolveScheduler } from './scheduler/solve-scheduler';
export type {
	SchedulerMode,
	CacheOptions,
	SolveSchedulerOptions,
	SolveContext,
	SolveResult,
	SolveExecutor
} from './scheduler/solve-scheduler';
export { hashSolveInput, stableStringify, fnv1a } from './scheduler/stable-hash';

// ============================================================================
// COMPUTATION
// ============================================================================
export { solveGrasshopperDefinition } from './compute/solve';

// ============================================================================
// I/O PROCESSING
// ============================================================================
export { fetchDefinitionIO, fetchParsedDefinitionIO } from './io/definition-io';
export {
	processInput,
	processInputs,
	processInputWithError,
	processInputsWithErrors
} from './io/input/input-processors';
export { getValues, getValue, extractFileData } from './io/output/response-processors';
export type {
	GetValuesOptions,
	GetValuesResult,
	ParsedContext
} from './io/output/response-processors';
export { registerDecoder, decodeRhinoGeometry, decodeRhinoObject } from './io/output/rhino-decoder';
export type { DecodeRhinoOptions } from './io/output/rhino-decoder';

// ============================================================================
// DATA STRUCTURES
// ============================================================================
export { TreeBuilder } from './data-tree/data-tree';
export type { DataTreeValue } from './data-tree/data-tree';

// ============================================================================
// FILE HANDLING
// ============================================================================
export { extractFilesFromComputeResponse, downloadFileData } from './file-handling/handle-files';
export type { ProcessedFile, FileData, FileBaseInfo } from './file-handling/types';

// ============================================================================
// TYPES
// ============================================================================
export type {
	DataTreePath,
	DataItem,
	DataTreeDefault,
	InnerTreeData,
	DataTree,
	Values,
	ProcessedDataItem,
	OutputType,
	DefaultValue,
	BaseInputType,
	NumericInputType,
	TextInputType,
	BooleanInputType,
	GeometryInputType,
	ValueListInputType,
	FileInputType,
	ColorInputType,
	InputParam,
	GrasshopperBaseSchema,
	GrasshopperDefinitionSource,
	GrasshopperComputeConfig,
	IoResponseSchema,
	GrasshopperRequestSchema,
	GrasshopperComputeResponse,
	InputParamSchema,
	OutputParamSchema,
	GrasshopperParsedIORaw,
	GrasshopperParsedIO,
	InputParseError
} from './types';
