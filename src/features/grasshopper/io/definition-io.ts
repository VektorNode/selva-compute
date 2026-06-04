import { ComputeConfig, RhinoComputeError, ErrorCodes } from '@/core';
import { fetchRhinoCompute } from '@/core/compute-fetch/compute-fetch';
import { readField } from '@/core/utils/read-field';
import { warnIfClientSide } from '@/core/utils/warnings';
import { prepareGrasshopperArgs } from '../solve';

import { GrasshopperParsedIO, GrasshopperParsedIORaw, IoResponseSchema } from '../types';

import { processInputsWithErrors } from './input/input-processors';
import { normalizeInputSchema, normalizeOutputSchema } from './normalize-schema';

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

	// The `/io` response is only partially camelCased, and how much depends on the
	// server branch. Upstream-tracking branches (mcneel 8.x/9.x, `8.x.selva`) keep
	// the C# classes close to source — they carry few/no `[JsonProperty]`, so the
	// top-level wrapper is PascalCase `Inputs` / `Outputs` and per-param fields are
	// `ParamType` / `Minimum` / … The VektorNode Compute8 fork camelCases every
	// field. So we read every field we depend on case-insensitively via `readField`
	// rather than straight-through. A deep `camelcaseKeys` pass is NOT an option: it
	// mangled user-authored value-list label keys ("Option A" → "optionA") and item
	// `data` JSON — which is why per-field reads exist instead (per-input field
	// normalization lives in normalize-schema.ts; the nested `default` DataTree is
	// handled by normalize-default.ts).
	//
	// The server also reports definition-LOAD diagnostics on the IO response
	// (`errors`/`warnings` — e.g. a missing plugin that left inputs unresolved).
	// Surface them so a degraded input list comes with an explanation instead of
	// silently looking empty. Only attach when non-empty to keep the common
	// happy-path result clean.
	const loadWarnings = nonEmptyStrings(readField(response, 'warnings'));
	const loadErrors = nonEmptyStrings(readField(response, 'errors'));

	// Read the top-level Inputs/Outputs case-insensitively, then guard to arrays.
	// A server fault can also return a 200 whose body omits these (e.g. a load
	// failure surfacing as malformed-success), and the downstream `for...of` in
	// processInputsWithErrors throws "inputs is not iterable". Array.isArray (not
	// `?? []`) is deliberate: the symptom is non-iterability, so a non-array truthy
	// value (`{}`, a string) must coerce to `[]` too. The loadErrors/loadWarnings
	// surfaced above explain *why* a list came back empty.
	const rawInputs = readField(response, 'inputs');
	const rawOutputs = readField(response, 'outputs');
	return {
		inputs: Array.isArray(rawInputs) ? rawInputs.map(normalizeInputSchema) : [],
		outputs: Array.isArray(rawOutputs) ? rawOutputs.map(normalizeOutputSchema) : [],
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
