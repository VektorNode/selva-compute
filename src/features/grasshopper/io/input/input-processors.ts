import { RhinoComputeError } from '@/core/errors';
import { getLogger } from '@/core/utils/logger';

import { normalizeDefaultWithWarning } from './normalize-default';
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
 * Parse one raw Grasshopper input schema into a typed {@link InputParam}.
 * Validation failures are swallowed and replaced with a safe default; use
 * {@link processInputWithError} to receive them.
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
	// shape the per-type parsers expect (pure — does not mutate rawInput). An
	// unrecognized default shape nulls the value AND returns a warning so the
	// drop is surfaced to the client via parseErrors instead of vanishing.
	const { schema, warning } = normalizeDefaultWithWarning({ ...rawInput, paramType });
	const defaultWarningError: InputParseError | undefined = warning && {
		inputName: rawInput.name || 'unknown',
		paramType,
		message: warning.message,
		code: warning.code
	};
	const parser = INPUT_TYPE_PARSERS.get(paramType);

	try {
		if (!parser) {
			throw RhinoComputeError.unknownParamType(paramType, rawInput.name);
		}
		// A malformed-default warning rides through on the otherwise-successful parse.
		return { input: parser.parse(schema, baseInput), error: defaultWarningError };
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
 * Parse an array of raw input schemas into typed {@link InputParam}s, each via
 * {@link processInput}. Use {@link processInputsWithErrors} to also collect the
 * inputs that failed validation.
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
