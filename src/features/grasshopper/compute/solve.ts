import { fetchRhinoCompute } from '@/core';
import { base64ByteArray, encodeStringToBase64, isBase64 } from '@/core/utils/encoding';
import { warnIfClientSide } from '@/core/utils/warnings';

import {
	GrasshopperRequestSchema,
	GrasshopperComputeConfig,
	GrasshopperComputeResponse,
	DataTree
} from '../types';

/**
 * Runs a Rhino Compute job using the provided tree prototypes and Grasshopper definition.
 *
 * @public Use this for direct compute control. For high-level API, use `GrasshopperClient.solve()`.
 *
 * @param dataTree - An array of `DataTree` objects representing the input data for the compute job.
 * @param definition - The Grasshopper definition, which can be:
 *   - A URL string (e.g., 'https://example.com/definition.gh')
 *   - A base64-encoded string of the .gh file
 *   - A plain string (will be base64-encoded)
 *   - A Uint8Array of the .gh file (will be base64-encoded)
 * @param config - Compute configuration (server URL, API key, etc. along with optional timeout, units, etc.)
 * @returns An object containing the compute result and extracted file data.
 *
 * @example
 * // Using a URL
 * await solveGrasshopperDefinition(trees, 'https://example.com/definition.gh', config);
 *
 * // Using a base64 string
 * await solveGrasshopperDefinition(trees, 'UEsDBBQAAAAIAL...', config);
 *
 * // Using binary data
 * const fileData = new Uint8Array([...]);
 * await solveGrasshopperDefinition(trees, fileData, config);
 */
export async function solveGrasshopperDefinition(
	dataTree: DataTree[],
	definition: string | Uint8Array,
	config: GrasshopperComputeConfig
): Promise<GrasshopperComputeResponse> {
	if (config.debug) {
		warnIfClientSide('solveGrasshopperDefinition', config.suppressClientSideWarning);
	}

	const args = prepareGrasshopperArgs(definition, dataTree);
	applyOptionalComputeSettings(args, config);

	const result = await fetchRhinoCompute('grasshopper', args, config);

	if ('pointer' in result) {
		delete (result as any).pointer;
	}

	return result;
}

// ============================================================================
// Grasshopper Arguments
// ============================================================================

/**
 * Prepares Grasshopper arguments from a definition and data tree.
 * Automatically detects the definition format and converts it appropriately.
 *
 * @param definition - Can be a URL, base64 string, plain string, or Uint8Array
 * @param dataTree - Array of DataTree objects for compute inputs
 * @internal
 */
export function prepareGrasshopperArgs(
	definition: string | Uint8Array,
	dataTree: DataTree[]
): GrasshopperRequestSchema {
	const args: GrasshopperRequestSchema = {
		algo: null,
		pointer: null,
		values: dataTree
	};

	if (definition instanceof Uint8Array) {
		// Binary data → convert to base64
		args.algo = base64ByteArray(definition);
	} else if (definition.startsWith('http')) {
		// URL → use as pointer reference
		args.pointer = definition;
	} else if (isBase64(definition)) {
		// Already base64 → use as-is
		args.algo = definition;
	} else {
		// Plain string → encode to base64
		args.algo = encodeStringToBase64(definition);
	}

	return args;
}


/**
 * @internal
 */
export function applyOptionalComputeSettings(
	arglist: GrasshopperRequestSchema,
	options: GrasshopperComputeConfig
): void {
	if (options.cachesolve !== null) arglist.cachesolve = options.cachesolve;
	if (options.modelunits !== null) arglist.modelunits = options.modelunits;
	if (options.angletolerance !== null) arglist.angletolerance = options.angletolerance;
	if (options.absolutetolerance !== null) arglist.absolutetolerance = options.absolutetolerance;
	if (options.dataversion !== null) arglist.dataversion = options.dataversion;
	if (options.filename !== null) arglist.filename = options.filename;
}
