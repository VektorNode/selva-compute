/**
 * Input and output parameter types
 */

import type { DataTreeDefault } from './trees';

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
 * Discriminated union of all input parameter types
 */
export type InputParam =
	| NumericInputType
	| BooleanInputType
	| TextInputType
	| ValueListInputType
	| GeometryInputType
	| FileInputType;
