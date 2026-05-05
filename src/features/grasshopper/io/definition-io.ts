import { ComputeConfig, RhinoComputeError, ErrorCodes } from '@/core';
import { fetchRhinoCompute } from '@/core/compute-fetch/compute-fetch';
import { camelcaseKeys } from '@/core/utils/camel-case';
import { warnIfClientSide } from '@/core/utils/warnings';
import { prepareGrasshopperArgs } from '../compute/solve';

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

	const response = await fetchRhinoCompute<'io'>('io', payload, config);

	if (!response || typeof response !== 'object') {
		throw new RhinoComputeError('Invalid IO response structure', ErrorCodes.INVALID_INPUT, {
			context: { response, definition }
		});
	}

	// Convert PascalCase to camelCase
	const camelCased = camelcaseKeys(response, { deep: true }) as IoResponseSchema;

	return {
		inputs: camelCased.inputs,
		outputs: camelCased.outputs
	};
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

	const { inputs: rawInputs, outputs } = await fetchDefinitionIO(definition, config);
	const { inputs, parseErrors } = processInputsWithErrors(rawInputs);

	return parseErrors.length > 0 ? { inputs, outputs, parseErrors } : { inputs, outputs };
}
