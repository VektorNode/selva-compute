/**
 * Grasshopper types
 */

import type { ComputeConfig, RhinoModelUnit } from '@/core/types';

// ============================================================================
// DATA TREE TYPES
// ============================================================================

/**
 * Grasshopper-style data tree branch path
 * @example "{0}", "{0;0}", "{0;1;2}"
 */
export type DataTreePath = `{${string}}`;

/**
 * Represents a data item in a data tree
 */
export interface DataItem {
	/** The type of the data, inferred from the Grasshopper GOO class */
	type: string;
	/** The actual returned data as a string that may need to be parsed */
	data: string;
	/** The grasshopper refrence id of the output */
	id: string;
}

/**
 * Grasshopper-style data tree for input defaults
 * @example
 * ```typescript
 * const numericTree: DataTreeDefault<number> = {
 *   "{0}": [1, 2, 3],
 *   "{0;0}": [4, 5],
 *   "{1}": [6]
 * };
 * ```
 */
export type DataTreeDefault<T = any> = {
	[K in DataTreePath]?: T[];
};

/**
 * Data structure for InnerTreeData matching Rhino Compute responses
 */
export type InnerTreeData = {
	[path in DataTreePath]: DataItem[];
};

/**
 * Tree with parameter metadata (used in compute responses)
 */
export interface DataTree {
	InnerTree: InnerTreeData;
	ParamName: string;
}

/**
 * Array of inner tree values (used in compute requests/responses)
 */
export type Values = DataTree[];

/**
 * Processed data item for output handling
 */
export interface ProcessedDataItem {
	type: string;
	data: any;
	path: string;
}

// ============================================================================
// INPUT / OUTPUT PARAMETER TYPES
// ============================================================================

/**
 * Output types supported from Grasshopper/Rhino Compute
 */
export type OutputType =
	| 'System.String'
	| 'System.Double'
	| 'System.Int32'
	| 'System.Boolean'
	| 'Rhino.Geometry.Point3d'
	| 'Rhino.Geometry.Line'
	| 'Rhino.Geometry.Circle'
	| 'Rhino.Geometry.Arc'
	| 'Rhino.Geometry.NurbsCurve'
	| 'Rhino.Geometry.Brep'
	| 'Rhino.Geometry.Mesh'
	| 'Rhino.Geometry.Vector3d'
	| 'Rhino.Geometry.Plane'
	| 'Rhino.Geometry.Box'
	| string;

/**
 * Union type for all possible default value types
 */
export type DefaultValue<T> = T | T[] | DataTreeDefault<T> | undefined | null;

/**
 * Base properties common to all processed input types.
 * Note: `groupName` and `id` require the custom Rhino Compute branch.
 */
export interface BaseInputType {
	description: string;
	name: string;
	nickname: string | null;
	treeAccess: boolean;

	/**
	 * Name of the group this parameter belongs to.
	 * @requires Custom branch of compute.rhino3d
	 */
	groupName?: string;

	/**
	 * Unique identifier for the parameter.
	 * @requires Custom branch of compute.rhino3d
	 */
	id?: string;
}

/**
 * Numeric input type (Number or Integer)
 */
export interface NumericInputType extends BaseInputType {
	paramType: 'Number' | 'Integer';
	minimum?: number | null;
	maximum?: number | null;
	atLeast?: number | null;
	atMost?: number | null;
	stepSize?: number | null;
	default: DefaultValue<number>;
}

/**
 * Text input type
 */
export interface TextInputType extends BaseInputType {
	paramType: 'Text';
	default: DefaultValue<string>;
}

/**
 * Boolean input type
 */
export interface BooleanInputType extends BaseInputType {
	paramType: 'Boolean';
	default: DefaultValue<boolean>;
}

/**
 * Geometry input type (generic geometry)
 */
export interface GeometryInputType extends BaseInputType {
	paramType: 'Geometry';
	default: DefaultValue<object | string>;
}

/**
 * ValueList input type (dropdown/select)
 */
export interface ValueListInputType extends BaseInputType {
	paramType: 'ValueList';
	values: Record<string, string>;
	default?: string;
}

/**
 * File input type
 */
export interface FileInputType extends BaseInputType {
	paramType: 'File';
	acceptedFormats?: string[];
	default: DefaultValue<object | string>;
}

/**
 * Color input type (stored as hex string)
 */
export interface ColorInputType extends BaseInputType {
	paramType: 'Color';
	default: DefaultValue<string>;
}

/**
 * Discriminated union of all input parameter types
 */
export type InputParam =
	| NumericInputType
	| BooleanInputType
	| TextInputType
	| ValueListInputType
	| GeometryInputType
	| FileInputType
	| ColorInputType;

// ============================================================================
// API SCHEMA TYPES
// ============================================================================

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

// ============================================================================
// PARSED TYPES
// ============================================================================

/**
 * Parsed input/output structure with raw schemas
 */
export interface GrasshopperParsedIORaw {
	inputs: InputParamSchema[];
	outputs: OutputParamSchema[];
}

/**
 * Per-input parse failure. The corresponding entry in `inputs` was filled
 * with a safe default so the rest of the pipeline can keep going — but the
 * caller should surface this so the user knows their definition has a
 * misconfigured parameter.
 */
export interface InputParseError {
	/** The input's `name` (or `'unknown'` if the schema didn't have one). */
	inputName: string;
	/** The declared paramType from the raw schema. */
	paramType: string;
	/** Human-readable reason from the underlying RhinoComputeError. */
	message: string;
	/** Error code from the underlying RhinoComputeError, if available. */
	code?: string;
}

/**
 * Parsed input/output structure with processed types.
 *
 * `parseErrors` is populated when one or more inputs failed validation and
 * fell back to a safe default. The result is still usable, but the UI should
 * surface these so the user can fix their definition.
 */
export interface GrasshopperParsedIO {
	inputs: InputParam[];
	outputs: OutputParamSchema[];
	parseErrors?: InputParseError[];
}
