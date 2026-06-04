import { fetchRhinoCompute, RhinoComputeError } from '@/core';
import { base64ByteArray, encodeStringToBase64, isBase64 } from '@/core/utils/encoding';
import { warnIfClientSide } from '@/core/utils/warnings';

import {
	GrasshopperRequestSchema,
	GrasshopperComputeConfig,
	GrasshopperComputeResponse,
	DataTree
} from './types';

/**
 * The exact message the server throws when it can neither resolve a `pointer`
 * nor a base64 `algo` to a definition (ResthopperEndpoints.cs). This is the
 * signal that a cache-key pointer missed the server's definition cache (GC'd, or
 * a different child in the pool), so the caller should retry with the full
 * definition. Matched as a substring because the server wraps it with a category
 * prefix in its exception handler.
 */
const DEFINITION_LOAD_FAILED = 'Unable to load grasshopper definition';

/** Does this error look like a server-side definition-load miss? */
function isDefinitionLoadMiss(error: unknown): boolean {
	return error instanceof RhinoComputeError && error.message.includes(DEFINITION_LOAD_FAILED);
}

/**
 * Result of a solve that also reports the definition's server-side cache key.
 *
 * `cacheKey` is the `md5_…` identifier the server assigned to the (base64)
 * definition — stable for identical content. A caller that holds it can solve
 * the same definition again by reference (`pointer: cacheKey`) instead of
 * re-uploading the full base64, which matters a lot for large (multi-MB)
 * definitions on a live UI. `null` when the server didn't return one (e.g. a
 * URL-pointer solve).
 */
export interface SolveWithCacheKey {
	response: GrasshopperComputeResponse;
	cacheKey: string | null;
}

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
		warnIfClientSide(
			'solveGrasshopperDefinition',
			config.suppressBrowserWarning ?? config.suppressClientSideWarning
		);
	}

	const { response } = await runSolve(prepareGrasshopperArgs(definition, dataTree), config);
	return response;
}

/**
 * Solve while reporting the server's definition cache key.
 *
 * Behaves like {@link solveGrasshopperDefinition} but returns the `cacheKey` the
 * server assigned, so a caller (e.g. the scheduler) can later solve the same
 * definition by reference instead of re-uploading it. The cache key is only
 * meaningful for base64/binary definitions; a URL-pointer solve returns the URL.
 *
 * @internal
 */
export async function solveGrasshopperDefinitionWithCacheKey(
	dataTree: DataTree[],
	definition: string | Uint8Array,
	config: GrasshopperComputeConfig
): Promise<SolveWithCacheKey> {
	if (config.debug) {
		warnIfClientSide(
			'solveGrasshopperDefinitionWithCacheKey',
			config.suppressBrowserWarning ?? config.suppressClientSideWarning
		);
	}

	return runSolve(prepareGrasshopperArgs(definition, dataTree), config);
}

/**
 * Solve a definition by its server-side cache key (`pointer: cacheKey`),
 * skipping the (potentially multi-MB) base64 upload. If the key has been evicted
 * from the server's definition cache — `DEFINITION_LOAD_FAILED` — transparently
 * retry once with the full `definition` and report the fresh cache key so the
 * caller can update its mapping.
 *
 * @returns The solve result plus the (possibly refreshed) cache key, and whether
 *   the fast path missed (so callers can record the new key / track hit rate).
 * @internal
 */
export async function solveByCacheKey(
	dataTree: DataTree[],
	cacheKey: string,
	definition: string | Uint8Array,
	config: GrasshopperComputeConfig
): Promise<SolveWithCacheKey & { missed: boolean }> {
	if (config.debug) {
		warnIfClientSide(
			'solveByCacheKey',
			config.suppressBrowserWarning ?? config.suppressClientSideWarning
		);
	}

	const pointerArgs: GrasshopperRequestSchema = { algo: null, pointer: cacheKey, values: dataTree };

	try {
		const fast = await runSolve(pointerArgs, config);
		return { ...fast, missed: false };
	} catch (error) {
		if (!isDefinitionLoadMiss(error)) throw error;
		// Cache miss — fall back to the full upload and capture the fresh key.
		const full = await runSolve(prepareGrasshopperArgs(definition, dataTree), config);
		return { ...full, missed: true };
	}
}

/**
 * Shared solve body: apply optional settings, POST, and split the server's
 * `pointer` (its cache key) off the response. Stripping via shallow copy rather
 * than `delete` keeps any already-observed response object unmutated.
 */
async function runSolve(
	args: GrasshopperRequestSchema,
	config: GrasshopperComputeConfig
): Promise<SolveWithCacheKey> {
	applyOptionalComputeSettings(args, config);

	const result = await fetchRhinoCompute<GrasshopperComputeResponse>('grasshopper', args, config);

	if ('pointer' in result) {
		const { pointer, ...rest } = result as GrasshopperComputeResponse & { pointer?: unknown };
		return {
			response: rest as GrasshopperComputeResponse,
			cacheKey: typeof pointer === 'string' ? pointer : null
		};
	}

	return { response: result, cacheKey: null };
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
	} else if (/^https?:\/\//i.test(definition)) {
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
	if (options.cachesolve != null) arglist.cachesolve = options.cachesolve;
	if (options.modelunits != null) arglist.modelunits = options.modelunits;
	if (options.angletolerance != null) arglist.angletolerance = options.angletolerance;
	if (options.absolutetolerance != null) arglist.absolutetolerance = options.absolutetolerance;
	if (options.dataversion != null) arglist.dataversion = options.dataversion;
}
