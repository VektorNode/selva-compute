import { RhinoComputeError } from '@/core/errors';

import { preProcessInputDefault } from './input-validators';
import { PARSERS } from './input-parsers';
import { getLogger } from '@/core/utils/logger';

import type {
	BaseInputType,
	BooleanInputType,
	GeometryInputType,
	InputParam,
	NumericInputType,
	InputParamSchema,
	TextInputType,
	ValueListInputType,
	FileInputType,
	ColorInputType,
	InputParseError
} from '../../types';

/**
 * Creates a safe default InputType when processing fails
 */
function createSafeDefault(rawInput: InputParamSchema, baseInput: BaseInputType): InputParam {
	const isList = (rawInput.atMost ?? 1) > 1;
	switch (rawInput.paramType) {
		case 'Number':
		case 'Integer':
			return {
				...baseInput,
				paramType: rawInput.paramType,
				minimum: rawInput.minimum,
				maximum: rawInput.maximum,
				atLeast: rawInput.atLeast,
				atMost: rawInput.atMost,
				default: isList ? [0] : 0
			} as NumericInputType;
		case 'Boolean':
			return {
				...baseInput,
				paramType: 'Boolean',
				default: isList ? [false] : false
			} as BooleanInputType;
		case 'Text':
			return {
				...baseInput,
				paramType: 'Text',
				default: isList ? [''] : ''
			} as TextInputType;
		case 'ValueList':
			return {
				...baseInput,
				paramType: 'ValueList',
				values: rawInput.values ?? {},
				default: isList ? [rawInput.default] : rawInput.default
			} as ValueListInputType;
		case 'File':
			return {
				...baseInput,
				paramType: 'File',
				default: isList ? [null] : null
			} as FileInputType;
		case 'Color':
			return {
				...baseInput,
				paramType: 'Color',
				default: isList ? ['0, 0, 0'] : '0, 0, 0'
			} as ColorInputType;
		default:
			return {
				...baseInput,
				paramType: 'Geometry',
				default: isList ? [null] : null
			} as GeometryInputType;
	}
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

	try {
		preProcessInputDefault(rawInput);

		const parser = PARSERS[rawInput.paramType];
		if (!parser) {
			throw RhinoComputeError.unknownParamType(rawInput.paramType, rawInput.name);
		}

		parser(rawInput);

		switch (rawInput.paramType) {
			case 'Number':
			case 'Integer':
				return {
					input: {
						...baseInput,
						paramType: rawInput.paramType,
						minimum: rawInput.minimum,
						maximum: rawInput.maximum,
						atLeast: rawInput.atLeast,
						atMost: rawInput.atMost,
						stepSize: rawInput.stepSize,
						default: rawInput.default as number | undefined
					} as NumericInputType
				};
			case 'Boolean':
				return {
					input: {
						...baseInput,
						paramType: 'Boolean',
						default: rawInput.default as boolean | undefined
					} as BooleanInputType
				};
			case 'Text':
				return {
					input: {
						...baseInput,
						paramType: 'Text',
						default: rawInput.default as string | undefined
					} as TextInputType
				};
			case 'ValueList':
				return {
					input: {
						...baseInput,
						paramType: 'ValueList',
						values: rawInput.values as Record<string, string>,
						default: rawInput.default as string | undefined
					} as ValueListInputType
				};
			case 'Geometry':
				return {
					input: {
						...baseInput,
						paramType: rawInput.paramType as 'Geometry',
						default: rawInput.default as object | string | undefined
					} as GeometryInputType
				};
			case 'File':
				return {
					input: {
						...baseInput,
						paramType: rawInput.paramType as 'File',
						acceptedFormats: rawInput.acceptedFormats,
						default: rawInput.default as object | string | undefined
					} as FileInputType
				};
			case 'Color':
				return {
					input: {
						...baseInput,
						paramType: 'Color',
						default: rawInput.default as string | undefined
					} as ColorInputType
				};
			default:
				throw RhinoComputeError.unknownParamType(rawInput.paramType, rawInput.name);
		}
	} catch (error) {
		if (error instanceof RhinoComputeError) {
			getLogger().error(`Validation error for input ${rawInput.name || 'unknown'}:`, error.message);
			return {
				input: createSafeDefault(rawInput, baseInput),
				error: {
					inputName: rawInput.name || 'unknown',
					paramType: rawInput.paramType,
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
				context: { paramName: rawInput.name, paramType: rawInput.paramType },
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
