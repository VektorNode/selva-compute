import { RhinoComputeError } from '@/core/errors';
import { getLogger } from '@/core';
import type { InputParamSchema } from '../../types';

/**
 * Validation utilities for input parameters
 * Consolidates scattered validation logic from input parsers and processors
 *
 * @internal This is an internal validation utilities module.
 */

/**
 * Context for validation operations
 */
export interface ValidationContext {
	inputName: string;
	paramType?: string;
	expectedType?: string;
}

/**
 * Validates that a ValueList input has defined values
 *
 * @param input - The input parameter to validate
 * @throws {RhinoComputeError} If values object is missing or empty
 */
export function validateValueListValues(input: InputParamSchema): void {
	if (!input.values || typeof input.values !== 'object' || Object.keys(input.values).length === 0) {
		throw RhinoComputeError.missingValues(input.nickname || 'unnamed', 'ValueList');
	}
}

/**
 * Validates that a default value exists in a ValueList's available values
 *
 * @param input - The input parameter to validate
 * @param warnOnly - If true, logs warning instead of throwing (default: true)
 */
export function validateValueListDefault(input: InputParamSchema, warnOnly: boolean = true): void {
	if (!input.values || input.default === undefined || input.default === null) {
		return;
	}

	// Case-insensitive check
	const defaultLower = String(input.default).toLowerCase();
	const valueExists = Object.keys(input.values).some((key) => key.toLowerCase() === defaultLower);

	if (!valueExists) {
		const message = `ValueList input "${input.nickname || 'unnamed'}" default value "${input.default}" is not in available values`;
		if (warnOnly) {
			getLogger().warn(message);
		} else {
			throw RhinoComputeError.invalidDefault(
				input.nickname || 'unnamed',
				input.default,
				Object.values(input.values)
			);
		}
	}
}

/**
 * Validates that an input parameter has a valid paramType
 *
 * @param paramType - The parameter type to validate
 * @param validTypes - Array of valid parameter types
 * @param inputName - Name of the input (for error reporting)
 * @throws {RhinoComputeError} If paramType is not in the valid types list
 */
export function validateParameterType(
	paramType: string,
	validTypes: string[],
	inputName?: string
): void {
	if (!validTypes.includes(paramType)) {
		throw RhinoComputeError.unknownParamType(paramType, inputName);
	}
}

/**
 * Normalizes a group name for consistent key generation
 *
 * @param groupName - The raw group name to normalize
 * @param options - Normalization options
 * @returns Normalized group name
 *
 * @remarks
 * - Removes whitespace
 * - Converts to lowercase
 * - Special handling for "hidden" / "hide" → "__hidden__"
 * - Optionally capitalizes for display
 */
export function normalizeGroupName(
	groupName: string,
	options?: {
		capitalize?: boolean;
		handleHidden?: boolean;
	}
): string {
	let normalized = groupName.trim().replace(/\s+/g, '').toLowerCase();

	if (options?.handleHidden && (normalized === 'hidden' || normalized === 'hide')) {
		return '__hidden__';
	}

	if (options?.capitalize) {
		normalized = normalized.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	return normalized;
}

/**
 * Validates that numeric input has valid min/max constraints
 *
 * @param input - The input parameter to validate
 * @throws {RhinoComputeError} If constraints are invalid
 */
export function validateNumericConstraints(input: InputParamSchema): void {
	if (
		input.minimum !== undefined &&
		input.minimum !== null &&
		input.maximum !== undefined &&
		input.maximum !== null
	) {
		if (input.minimum > input.maximum) {
			throw RhinoComputeError.validation(
				input.nickname || 'unnamed',
				`minimum (${input.minimum}) cannot be greater than maximum (${input.maximum})`
			);
		}
	}

	if (input.atLeast !== undefined && input.atMost !== undefined) {
		if (input.atLeast > input.atMost) {
			throw RhinoComputeError.validation(
				input.nickname || 'unnamed',
				`atLeast (${input.atLeast}) cannot be greater than atMost (${input.atMost})`
			);
		}
	}
}

/**
 * Extracts numeric precision from a value
 *
 * @param value - The numeric value to analyze
 * @returns Number of decimal places
 */
export function extractNumericPrecision(value: number): number {
	if (!Number.isFinite(value) || value === 0) {
		return 0;
	}

	const str = String(value);

	// Handle exponential notation
	const expMatch = str.toLowerCase().match(/e(-?\d+)/);
	if (expMatch) {
		return Math.abs(Number(expMatch[1]));
	}

	// Handle standard decimal notation
	const decimalPart = str.split('.')[1];
	if (!decimalPart) {
		return 0;
	}

	return Math.min(decimalPart.length, 12);
}

/**
 * Validates input structure for expected types
 *
 * @param input - The input to validate
 * @param expectedStructure - Description of expected structure
 * @throws {RhinoComputeError} If structure doesn't match expectations
 */
export function validateInputStructure(
	input: unknown,
	expectedStructure: string,
	inputName?: string
): void {
	if (!input || typeof input !== 'object') {
		throw RhinoComputeError.invalidStructure(inputName || 'unknown', expectedStructure);
	}
}

/**
 * Validates that required properties exist in an object
 *
 * @param obj - The object to validate
 * @param requiredProps - Array of required property names
 * @param context - Validation context for error reporting
 * @throws {RhinoComputeError} If any required property is missing
 */
export function validateRequiredProperties(
	obj: Record<string, unknown>,
	requiredProps: string[],
	context: ValidationContext
): void {
	const missing = requiredProps.filter((prop) => !(prop in obj));

	if (missing.length > 0) {
		throw RhinoComputeError.validation(
			context.inputName,
			`missing required properties: ${missing.join(', ')}`
		);
	}
}

/**
 * Pre-processes raw input to normalize default values
 * Handles data tree structures, flattening, and type parsing
 *
 * @param input - The input parameter to pre-process
 *
 * @remarks
 * This consolidates preprocessing logic from input-processors.ts
 * Handles:
 * - Empty data trees → undefined
 * - Tree structure preservation for tree access parameters
 * - Flattening of multiple values
 * - Type-aware parsing (numbers, booleans, JSON)
 */
export function preProcessInputDefault(input: InputParamSchema): void {
	if (typeof input.default !== 'object' || input.default === null) {
		return;
	}

	if (!('innerTree' in input.default)) {
		getLogger().warn('Unexpected structure in input.default:', input.default);
		input.default = null;
		return;
	}

	const innerTree = (input.default as any).innerTree;

	// If innerTree is empty, set default to undefined
	if (Object.keys(innerTree).length === 0) {
		input.default = undefined;
		return;
	}

	// If treeAccess is true or atMost > 1, preserve the tree structure
	if (input.treeAccess || (input.atMost && input.atMost > 1)) {
		// Convert each branch to an array of parsed data
		const tree: Record<string, any[]> = {};
		for (const [branch, items] of Object.entries(innerTree)) {
			tree[branch] = (items as any[]).map((item) => {
				// Try to parse numbers, booleans, or JSON if possible
				if (typeof item.data === 'string') {
					if (item.type === 'System.Double' || item.type === 'System.Int32') {
						const num = Number(item.data);
						return Number.isNaN(num) ? item.data : num;
					}
					if (item.type === 'System.Boolean') {
						return item.data.toLowerCase() === 'true';
					}
					if (item.type.startsWith('Rhino.Geometry') || item.type === 'System.String') {
						try {
							return JSON.parse(item.data);
						} catch {
							return item.data;
						}
					}
				}
				return item.data;
			});
		}
		input.default = tree;
		return;
	}

	// Otherwise, flatten all values as before
	const allValues: any[] = [];
	for (const items of Object.values(innerTree)) {
		if (Array.isArray(items)) {
			items.forEach((item) => {
				if (item && typeof item === 'object' && 'data' in item) {
					allValues.push(item.data);
				}
			});
		}
	}
	if (allValues.length === 0) {
		input.default = undefined;
	} else if (allValues.length === 1) {
		input.default = allValues[0];
	} else {
		input.default = allValues;
	}
}
