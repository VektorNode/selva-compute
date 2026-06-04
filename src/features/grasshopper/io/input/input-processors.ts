import { RhinoComputeError } from '@/core/errors';
import { getLogger } from '@/core/utils/logger';

import { normalizeDefault } from './normalize-default';
import { INPUT_TYPE_PARSERS, UNKNOWN_TYPE_FALLBACK } from './input-type-parsers';

import type { BaseInputType, InputParam, InputParamSchema, InputParseError } from '../../types';

/** Canonical paramType for each supported type, keyed by its lowercased form. */
const CANONICAL_PARAM_TYPES = new Map(
	[...INPUT_TYPE_PARSERS.keys()].map((key) => [key.toLowerCase(), key])
);

/**
 * Returns the canonical casing for a paramType (e.g. "valuelist" → "ValueList"),
 * or the original value unchanged when it isn't a known type so the
 * unknown-paramType error still surfaces downstream.
 */
function canonicalizeParamType(paramType: string): string {
	return CANONICAL_PARAM_TYPES.get(paramType?.toLowerCase()) ?? paramType;
}

/**
 * Processes a raw input parameter schema and converts it into a typed InputParam object.
 *
 * @internal This is an internal processor. Use `fetchParsedDefinitionIO()` to get processed inputs instead.
 *
 * This function handles the transformation of raw input parameter data from Grasshopper into
 * a structured, type-safe format. It performs validation, type-specific processing, and error
 * handling for various parameter types including numeric, boolean, text, geometry, point, and line inputs.
 *
 * @param rawInput - The raw input parameter schema to process
 * @returns A fully processed and typed InputParam object with appropriate type-specific properties
 *
 * @throws {RhinoComputeError} When an unknown paramType is encountered
 * @throws {Error} Re-throws any non-RhinoComputeError exceptions
 *
 * @remarks
 * The function performs the following operations:
 * - Extracts base properties common to all input types
 * - Preprocesses the raw input data
 * - Applies type-specific validation and transformation
 * - Handles errors gracefully by creating safe default values for validation errors
 *
 * Supported parameter types:
 * - `Number` and `Integer`: Numeric inputs with optional min/max constraints
 * - `Boolean`: Boolean flag inputs
 * - `Text`: String inputs
 * - `Geometry`: Generic geometry objects
 * - `Point`: 3D point objects
 * - `Line`: Line objects
 *
 * @example
 * ```typescript
 * const rawInput = {
 *   name: 'Length',
 *   paramType: 'Number',
 *   minimum: 0,
 *   maximum: 100,
 *   default: 50
 * };
 * const processedInput = processInput(rawInput);
 * ```
 */
export function processInput(rawInput: InputParamSchema): InputParam {
	return processInputWithError(rawInput).input;
}

/**
 * Like {@link processInput}, but reports validation failures back to the caller
 * instead of swallowing them with a logger warning.
 *
 * On success: `{ input, error: undefined }`.
 * On a recoverable validation failure: `{ input: <safe default>, error: {...} }`.
 *
 * Unexpected (non-RhinoComputeError) failures still throw — they indicate a
 * programming bug, not bad user input.
 *
 * @internal Used by {@link processInputsWithErrors} / {@link fetchParsedDefinitionIO}.
 */
export function processInputWithError(rawInput: InputParamSchema): {
	input: InputParam;
	error?: InputParseError;
} {
	const baseInput: BaseInputType = {
		description: rawInput.description,
		name: rawInput.name,
		nickname: rawInput.nickname,
		treeAccess: rawInput.treeAccess,
		groupName: rawInput.groupName ?? '',
		id: rawInput.id
	};

	// Normalize paramType to its canonical casing so callers can send any case
	// (e.g. Selva schemas emit lowercase "valueList" while the plugin reports
	// "ValueList"). The registry is keyed by canonical type.
	const paramType = canonicalizeParamType(rawInput.paramType);

	// Shared, type-independent step: flatten the raw innerTree default into the
	// shape the per-type parsers expect (pure — does not mutate rawInput).
	const schema = normalizeDefault({ ...rawInput, paramType });
	const parser = INPUT_TYPE_PARSERS.get(paramType);

	try {
		if (!parser) {
			throw RhinoComputeError.unknownParamType(paramType, rawInput.name);
		}
		return { input: parser.parse(schema, baseInput) };
	} catch (error) {
		if (error instanceof RhinoComputeError) {
			getLogger().error(`Validation error for input ${rawInput.name || 'unknown'}:`, error.message);
			// The parser owns its own fallback; an unknown type falls back to the
			// geometry-shaped safe default (matching the old behavior).
			return {
				input: (parser ?? UNKNOWN_TYPE_FALLBACK).fallback(schema, baseInput),
				error: {
					inputName: rawInput.name || 'unknown',
					paramType,
					message: error.message,
					code: error.code
				}
			};
		}

		// Unexpected failure — surface it.
		throw new RhinoComputeError(
			error instanceof Error ? error.message : String(error),
			'VALIDATION_ERROR',
			{
				context: { paramName: rawInput.name, paramType },
				originalError: error instanceof Error ? error : new Error(String(error))
			}
		);
	}
}

/**
 * Processes raw Grasshopper input schemas into strongly-typed TypeScript interfaces.
 *
 * @internal This is an internal batch processor. Use `fetchParsedDefinitionIO()` to get processed inputs instead.
 *
 * Transforms each raw input parameter by:
 * - Normalizing default values (flattening data trees, parsing primitives)
 * - Applying type-specific parsing (Number, Text, Boolean, Geometry, etc.)
 * - Validating constraints (min/max, required fields)
 * - Converting to discriminated union types for type safety
 *
 * @param rawInputs - Array of raw input schemas from Rhino Compute API
 * @returns Array of processed, strongly-typed input parameters
 *
 * @remarks
 * - Empty data trees are converted to `undefined`
 * - Single values are extracted from arrays when appropriate
 * - Tree structures are preserved for list/tree access parameters
 * - Invalid inputs fall back to safe defaults with console warnings
 *
 * @example
 * ```typescript
 * const rawInputs = [
 *   { paramType: 'Number', name: 'radius', minimum: 0, default: 10 },
 *   { paramType: 'Text', name: 'label', default: 'Hello' }
 * ];
 *
 * const processed = processInputs(rawInputs);
 * // Result: [
 * //   { paramType: 'Number', name: 'radius', minimum: 0, default: 10, ... },
 * //   { paramType: 'Text', name: 'label', default: 'Hello', ... }
 * // ]
 *
 * // Now type-safe:
 * if (processed[0].paramType === 'Number') {
 *   console.log(processed[0].minimum); // TypeScript knows this exists
 * }
 * ```
 *
 * @see {@link processInput} for individual input processing logic
 */
export function processInputs(rawInputs: InputParamSchema[]): InputParam[] {
	return processInputsWithErrors(rawInputs).inputs;
}

/**
 * Like {@link processInputs}, but additionally returns a list of inputs that
 * failed validation and were filled with a safe default.
 *
 * @internal Used by {@link fetchParsedDefinitionIO}.
 */
export function processInputsWithErrors(rawInputs: InputParamSchema[]): {
	inputs: InputParam[];
	parseErrors: InputParseError[];
} {
	const inputs: InputParam[] = [];
	const parseErrors: InputParseError[] = [];
	for (const raw of rawInputs) {
		const { input, error } = processInputWithError(raw);
		inputs.push(input);
		if (error) parseErrors.push(error);
	}
	return { inputs, parseErrors };
}
