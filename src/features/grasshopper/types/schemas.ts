/**
 * API request/response schemas for Grasshopper compute operations
 *
 * @important These types mirror the Rhino.Compute API schema (Resthopper.IO).
 * When Rhino.Compute is updated or types change, these definitions must be
 * adjusted to maintain compatibility with the Compute server API.
 *
 * Reference: https://github.com/mcneel/rhino-compute/tree/main/src/compute.sln/Resthopper.IO
 */

import type { ComputeConfig, RhinoModelUnit } from '@/core/types';
import type { DataTree } from './trees';

/**
 * Base Grasshopper schema properties shared by config, args, and response
 */
export interface GrasshopperBaseSchema {
	/** Absolute tolerance used in computation */
	absolutetolerance?: number | null;
	/** Angular tolerance used in computation */
	angletolerance?: number | null;
	/** Model units used */
	modelunits?: RhinoModelUnit | null;
	/** Data version (7 or 8) */
	dataversion?: 7 | 8 | null;
	/** Whether to use cached solution */
	cachesolve?: boolean | null;
	/**
	 * Data format for response
	 * - 0: Hops (legacy)
	 * - 1: Grasshopper ( GH_Structure<IGH_Goo>) TODO: Check on how to convert thisclea
	 * @requires Rhino 9.0 or later
	 */
	dataformat?: 0 | 1 | null;
}

/**
 * Definition source (used in args and response)
 */
export interface GrasshopperDefinitionSource {
	/** Base64 encoded algorithm (if embedded) */
	algo?: string | null;
	/** URL pointer to definition file */
	pointer?: string | null;
	/** Filename of the definition */
	filename?: string | null;
}

/**
 * Configuration for Grasshopper compute operations
 * Combines server config with optional Grasshopper-specific computation settings
 *
 * Note: The definition source (pointer/algo) is NOT part of config.
 * Instead, pass the definition directly to methods like solve(), getIO(), etc.
 */
export interface GrasshopperComputeConfig extends ComputeConfig {
	/** Absolute tolerance used in computation */
	absolutetolerance?: number | null;
	/** Angular tolerance used in computation */
	angletolerance?: number | null;
	/** Model units used */
	modelunits?: RhinoModelUnit | null;
	/** Data version (7 or 8) */
	dataversion?: 7 | 8 | null;
	/** Whether to use cached solution */
	cachesolve?: boolean | null;
	/**
	 * Data format for response
	 * - 0: Default binary format (legacy)
	 * - 1: JSON format (more human-readable, Rhino 9+)
	 * @requires Rhino 9.0 or later
	 */
	dataformat?: 0 | 1 | null;
}

/**
 * Raw I/O response schema from API (PascalCase)
 *
 * This is the direct response format from the Rhino Compute server API.
 * All property names are in PascalCase, which is typical for .NET APIs.
 * This raw response is converted to camelCase by the camelcaseKeys() function
 * in the fetchDefinitionIO() method.
 */
export interface IoResponseSchema {
	description: string;
	filename: string;
	cachekey: string;
	inputnames: string[];
	outputnames: string[];
	icon: string | null;
	inputs: InputParamSchema[];
	outputs: OutputParamSchema[];
	warnings: any[];
	errors: any[];
	/** Supported data formats (Rhino 9+) */
	supporteddataformats?: number[];
}

/**
 * Arguments sent to Grasshopper compute endpoint
 * Includes config options + definition source + input values
 */
export interface GrasshopperRequestSchema
	extends GrasshopperBaseSchema, GrasshopperDefinitionSource {
	/** Input values organized by parameter */
	values?: DataTree[];
}

/**
 * Response from Grasshopper compute server
 * Includes all schema fields + computed results
 */
export interface GrasshopperComputeResponse
	extends GrasshopperBaseSchema, GrasshopperDefinitionSource {
	/** Whether cache was used (always present in response) */
	cachesolve: boolean;
	/** Model units (always present in response) */
	modelunits: RhinoModelUnit;
	/** Base64 encoded algorithm (always present in response) */
	algo: string;
	/** Filename of the definition (always present in response) */
	filename: string | null;
	/** Data version */
	dataversion: 7 | 8;
	/** Recursion level used */
	recursionlevel?: number;
	/** Output values organized by parameter */
	values: DataTree[];
	/** GH_IO binary archive output (when dataformat: 1, Rhino 9+) */
	'values-grasshopper'?: Record<string, unknown> | null;
	/** Computation errors */
	errors?: string[];
	/** Computation warnings */
	warnings?: string[];
}

/**
 * Output parameter
 */
export interface OutputParamSchema {
	name: string;
	nickname: string | null;
	paramType: string;
	/**
	 * Grasshopper parameter instance GUID
	 */
	id: string;
}

/**
 * Input parameter
 */
export interface InputParamSchema {
	/**
	 * Grasshopper parameter instance GUID
	 */
	id: string;
	name: string;
	nickname: string | null;
	description: string;
	paramType: string;
	treeAccess: boolean;
	minimum: number | null;
	maximum: number | null;
	atLeast: number;
	atMost: number;
	stepSize?: number;
	default: any;
	/**
	 * Key-value pairs for dropdown options
	 */
	values?: Record<string, string>;
	/**
	 * Accepted file formats for File input
	 */
	acceptedFormats?: string[];
	groupName?: string | null;
}
