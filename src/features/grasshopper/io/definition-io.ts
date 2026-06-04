import { ComputeConfig, RhinoComputeError, ErrorCodes } from '@/core';
import { fetchRhinoCompute } from '@/core/compute-fetch/compute-fetch';
import { warnIfClientSide } from '@/core/utils/warnings';
import { prepareGrasshopperArgs } from '../solve';

import { GrasshopperParsedIO, GrasshopperParsedIORaw, IoResponseSchema } from '../types';

import { processInputsWithErrors } from './input/input-processors';

/**
 * Fetches raw input/output schemas from a Grasshopper definition.
 * Returns unprocessed data exactly as received from the Rhino Compute API (camelCased).
 *
 * @param definition - The Grasshopper definition (URL, base64 string, or Uint8Array)
 * @param config - Compute configuration (server URL, API key, etc.)
 * @returns Raw inputs and outputs with no type processing
 * @throws {RhinoComputeError} If fetch fails or response is invalid
 *
 * @public Use `fetchParsedDefinitionIO()` for processed, type-safe inputs
 */
export async function fetchDefinitionIO(
	definition: string | Uint8Array,
	config: ComputeConfig
): Promise<GrasshopperParsedIORaw> {
	const args = prepareGrasshopperArgs(definition, []);
	const payload: { algo?: string | null; pointer?: string | null } = {};
	if (args.algo) payload.algo = args.algo;
	if (args.pointer) payload.pointer = args.pointer;

	if (!payload.algo && !payload.pointer) {
		throw new RhinoComputeError(
			'Definition must resolve to either a URL pointer or base64 algo',
			ErrorCodes.INVALID_INPUT,
			{ context: { definition } }
		);
	}

	const response = await fetchRhinoCompute<IoResponseSchema>('io', payload, config);

	if (!response || typeof response !== 'object') {
		throw new RhinoComputeError('Invalid IO response structure', ErrorCodes.INVALID_INPUT, {
			context: { response, definition }
		});
	}

	// The Compute8 server fork already serializes the IO schema in camelCase
	// (`[JsonProperty("paramType")]` etc.) — pinned by the seam snapshot in
	// tests/contract/server-contract.test.ts. So we read the fields straight
	// through. A previous deep `camelcaseKeys` here was not only redundant but
	// corrupted value-list `values` keys — user-authored dropdown labels like
	// "Option A" were mangled to "optionA" (regression-pinned in
	// definition-io.casing.test.ts).
	//
	// The server also reports definition-LOAD diagnostics on the IO response
	// (`errors`/`warnings` — e.g. a missing plugin that left inputs unresolved).
	// Surface them so a degraded input list comes with an explanation instead of
	// silently looking empty. Only attach when non-empty to keep the common
	// happy-path result clean.
	const loadWarnings = nonEmptyStrings(response.warnings);
	const loadErrors = nonEmptyStrings(response.errors);

	return {
		inputs: response.inputs,
		outputs: response.outputs,
		...(loadWarnings && { loadWarnings }),
		...(loadErrors && { loadErrors })
	};
}

/**
 * Coerce a server `errors`/`warnings` array (typed `any[]`) into a clean
 * `string[]`, or `undefined` when there's nothing to report. Filters non-string
 * and blank entries defensively.
 */
function nonEmptyStrings(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const cleaned = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
	return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Fetches and processes input/output schemas from a Grasshopper definition.
 * Returns strongly-typed, validated input parameters ready for use.
 *
 * @public This is the recommended way to fetch definition I/O schemas.
 *
 * @param definition - The Grasshopper definition (URL, base64 string, or Uint8Array)
 * @param config - Compute configuration (server URL, API key, etc.)
 * @returns Processed inputs with discriminated union types and outputs
 * @throws {RhinoComputeError} If fetch fails or response is invalid
 *
 * @example
 * ```typescript
 * const { inputs, outputs } = await fetchParsedDefinitionIO(
 *   'https://example.com/definition.gh',
 *   { serverUrl: 'https://compute.rhino3d.com', apiKey: 'YOUR_KEY' }
 * );
 *
 * // Inputs are now strongly typed
 * inputs.forEach(input => {
 *   if (input.paramType === 'Number') {
 *     console.log(input.minimum, input.maximum); // TypeScript knows these exist
 *   }
 * });
 * ```
 */
export async function fetchParsedDefinitionIO(
	definition: string | Uint8Array,
	config: ComputeConfig
): Promise<GrasshopperParsedIO> {
	warnIfClientSide(
		'fetchParsedDefinitionIO',
		config.suppressBrowserWarning ?? config.suppressClientSideWarning
	);

	const {
		inputs: rawInputs,
		outputs,
		loadWarnings,
		loadErrors
	} = await fetchDefinitionIO(definition, config);
	const { inputs, parseErrors } = processInputsWithErrors(rawInputs);

	return {
		inputs,
		outputs,
		...(parseErrors.length > 0 && { parseErrors }),
		...(loadWarnings && { loadWarnings }),
		...(loadErrors && { loadErrors })
	};
}
