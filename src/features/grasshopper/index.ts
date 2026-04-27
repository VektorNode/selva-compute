/**
 * Grasshopper computation and I/O processing
 *
 * This module provides client APIs and utilities for working with
 * Grasshopper definitions and Rhino Compute.
 */

// ============================================================================
// CLIENT API (Recommended)
// ============================================================================
export { GrasshopperClient, GrasshopperResponseProcessor } from './client';
export type { SolveOptions } from './client';

// ============================================================================
// SCHEDULER
// ============================================================================
export { SolveScheduler, hashSolveInput } from './scheduler';
export type {
	SchedulerMode,
	CacheOptions,
	SolveSchedulerOptions,
	SolveContext,
	SolveResult,
	SolveExecutor
} from './scheduler';

// ============================================================================
// COMPUTATION
// ============================================================================
export { solveGrasshopperDefinition } from './compute';

// ============================================================================
// I/O PROCESSING
// ============================================================================
export { fetchDefinitionIO, fetchParsedDefinitionIO, processInput, processInputs } from './io';
export {
	getValues,
	getValue,
	extractFileData,
	registerDecoder,
	decodeRhinoGeometry,
	decodeRhinoObject
} from './io';
export type { GetValuesOptions, GetValuesResult, ParsedContext, DecodeRhinoOptions } from './io';

// ============================================================================
// DATA STRUCTURES
// ============================================================================
export { TreeBuilder } from './data-tree';
export type { DataTreeValue } from './data-tree';

// ============================================================================
// FILE HANDLING
// ============================================================================
export { extractFilesFromComputeResponse, downloadFileData } from './file-handling';
export type { ProcessedFile, FileData, FileBaseInfo } from './file-handling';

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
	GrasshopperParsedIO
} from './types';
