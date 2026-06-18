import { ErrorCodes, RhinoComputeError } from '@/core/errors';
import { getLogger } from '@/core/utils/logger';
import ComputeServerStats from '@/core/server/compute-server-stats';
import { validateServerUrl } from '@/core/server/validate-server-url';
import { ComputeConfig, RetryPolicy } from '@/core/types';

import { fetchDefinitionIO, fetchParsedDefinitionIO, solveGrasshopperDefinition } from '..';
import { solveByCacheKey, solveGrasshopperDefinitionWithCacheKey } from '../solve';
import { GrasshopperComputeConfig, GrasshopperComputeResponse, DataTree } from '../types';
import {
	SolveScheduler,
	SolveSchedulerOptions,
	CacheKeyExecutor
} from '../scheduler/solve-scheduler';

/**
 * Per-call options that override the client's default ComputeConfig values.
 *
 * Use these for per-request control without mutating the client config:
 * - `signal` — cancel a specific solve (e.g. when a slider value is superseded)
 * - `timeoutMs` — extend timeout for a long-running solve, or pass `0` to disable
 * - `retry` — override retry policy for this call only
 */
export interface SolveOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
	retry?: RetryPolicy;
}

/**
 * GrasshopperClient provides a simple API for interacting with a Rhino Compute server and grasshopper.
 *
 * @public This is the recommended high-level API for Rhino Compute operations.
 *
 * **Security Warning:**
 * Using this client in a browser environment exposes your server URL and API key to users.
 * For production, use this library server-side or proxy requests through your own backend.
 *
 * @example
 * ```typescript
 * const client = await GrasshopperClient.create({
 *   serverUrl: 'http://localhost:6500',
 *   apiKey: 'your-api-key'
 * });
 *
 * try {
 *   const result = await client.solve(definitionUrl, { x: 1, y: 2 });
 * } finally {
 *   await client.dispose(); // Clean up resources
 * }
 * ```
 */
export default class GrasshopperClient {
	private readonly config: GrasshopperComputeConfig;
	public readonly serverStats: ComputeServerStats;
	private disposed = false;

	private constructor(config: GrasshopperComputeConfig) {
		this.config = this.normalizeComputeConfig(config);
		this.serverStats = new ComputeServerStats(this.config.serverUrl, this.config.apiKey);
	}

	/**
	 * Creates and initializes a GrasshopperClient with server validation.
	 *
	 * The pre-flight liveness probe (a GET on the proxy root `/`) is a
	 * single-sample boolean gate that reads a cold or briefly-busy-but-up server
	 * as offline. To avoid failing
	 * construction on that transient class, the probe is retried with a short
	 * exponential backoff before giving up. Each probe is also bounded by a
	 * timeout so a hung connection can't stall construction.
	 *
	 * @throws {RhinoComputeError} with code NETWORK_ERROR if the server stays
	 *   unreachable across all attempts
	 * @throws {RhinoComputeError} with code INVALID_CONFIG if configuration is invalid
	 */
	static async create(config: GrasshopperComputeConfig): Promise<GrasshopperClient> {
		const client = new GrasshopperClient(config);

		// A single liveness miss isn't authoritative — a cold/busy-but-up
		// server flickers non-200. Retry a few times with backoff before failing.
		const attempts = Math.max(1, (config.retry?.attempts ?? 2) + 1);
		const baseDelayMs = config.retry?.baseDelayMs ?? 250;
		const maxDelayMs = config.retry?.maxDelayMs ?? 1000;

		// The liveness probe is a trivial GET — always bound it, independent of the
		// solve timeout (which may be 0 to allow arbitrarily long solves).
		for (let attempt = 0; attempt < attempts; attempt++) {
			if (await client.serverStats.isServerOnline()) {
				return client;
			}

			if (attempt < attempts - 1) {
				const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		await client.dispose();
		throw new RhinoComputeError('Rhino Compute server is not online', ErrorCodes.NETWORK_ERROR, {
			context: { serverUrl: client.config.serverUrl, attempts }
		});
	}

	/**
	 * Gets the client's configuration.
	 * Useful for passing to lower-level functions.
	 */
	public getConfig(): GrasshopperComputeConfig {
		this.ensureNotDisposed();
		return { ...this.config };
	}

	/**
	 * Get input/output parameters of a Grasshopper definition.
	 */
	public async getIO(definition: string | Uint8Array) {
		this.ensureNotDisposed();
		return fetchParsedDefinitionIO(definition, this.config);
	}

	public async getRawIO(definition: string | Uint8Array) {
		this.ensureNotDisposed();
		return fetchDefinitionIO(definition, this.config);
	}

	/**
	 * Run a compute job with a Grasshopper definition.
	 *
	 * @throws {RhinoComputeError} with code INVALID_INPUT if definition is empty
	 * @throws {RhinoComputeError} with code NETWORK_ERROR if server is offline
	 * @throws {RhinoComputeError} with code COMPUTATION_ERROR if computation fails
	 */
	public async solve(
		definition: string | Uint8Array,
		dataTree: DataTree[],
		options?: SolveOptions
	): Promise<GrasshopperComputeResponse> {
		this.ensureNotDisposed();

		try {
			// Validate inputs
			if (typeof definition === 'string' && !definition?.trim()) {
				throw new RhinoComputeError(
					'Definition URL/content is required',
					ErrorCodes.INVALID_INPUT,
					{
						context: { receivedUrl: definition }
					}
				);
			} else if (definition instanceof Uint8Array && definition.length === 0) {
				throw new RhinoComputeError('Definition content is empty', ErrorCodes.INVALID_INPUT);
			}

			// Per-call options override the client's stored config for this request only
			const effectiveConfig: GrasshopperComputeConfig = {
				...this.config,
				...(options?.signal !== undefined && { signal: options.signal }),
				...(options?.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
				...(options?.retry !== undefined && { retry: options.retry })
			};

			// Skip the redundant pre-flight healthcheck — fetchRhinoCompute already surfaces
			// network failures with a NETWORK_ERROR code, so adding a roundtrip here only
			// doubles latency on every solve.
			const result = await solveGrasshopperDefinition(dataTree, definition, effectiveConfig);

			// Compute may return a partial-success response (HTTP 500 with a body
			// containing both `values` and `errors`/`warnings`). Surface that as a
			// COMPUTATION_ERROR so callers don't silently consume a broken result.
			if (result?.errors && result.errors.length > 0) {
				throw new RhinoComputeError(
					result.errors.join('; ') || 'Computation failed',
					ErrorCodes.COMPUTATION_ERROR,
					{
						context: {
							definition:
								typeof definition === 'string' && definition.length < 200
									? definition
									: '...content...',
							inputs: dataTree,
							errors: result.errors,
							warnings: result.warnings
						}
					}
				);
			}

			return result;
		} catch (error) {
			if (this.config.debug) {
				getLogger().error('Compute failed:', error);
			}

			if (error instanceof RhinoComputeError) {
				throw error;
			}

			throw new RhinoComputeError(
				error instanceof Error ? error.message : String(error),
				ErrorCodes.COMPUTATION_ERROR,
				{
					context: {
						definition:
							typeof definition === 'string' && definition.length < 200
								? definition
								: '...content...',
						inputs: dataTree
					},
					originalError: error instanceof Error ? error : new Error(String(error))
				}
			);
		}
	}

	/**
	 * Create a scheduler bound to this client. Use a scheduler for any UI surface
	 * that fires solves frequently (sliders, live editors) or that needs cancel
	 * semantics, response caching, or state observability.
	 *
	 * Multiple schedulers can be created from a single client — typically one per
	 * UI surface so their queues stay independent.
	 *
	 * @example
	 * ```ts
	 * const sliderScheduler = client.createScheduler({ mode: 'latest-wins' });
	 * const submitScheduler = client.createScheduler({ mode: 'queue', timeoutMs: 0, retry: { attempts: 1 } });
	 * ```
	 */
	public createScheduler(options?: SolveSchedulerOptions): SolveScheduler {
		this.ensureNotDisposed();
		const executor = (
			definition: string | Uint8Array,
			dataTree: DataTree[],
			config: GrasshopperComputeConfig
		) => solveGrasshopperDefinition(dataTree, definition, config);

		// Cache-key-aware executor: solve by `pointer: cacheKey` when known (skips
		// re-uploading large definitions), capturing/refreshing the key and
		// falling back to a full upload on a server cache miss.
		const cacheKeyExecutor: CacheKeyExecutor = (definition, dataTree, cacheKey, config) =>
			cacheKey === null
				? solveGrasshopperDefinitionWithCacheKey(dataTree, definition, config).then((r) => ({
						...r,
						missed: false
					}))
				: solveByCacheKey(dataTree, cacheKey, definition, config);

		return new SolveScheduler(executor, this.config, options, cacheKeyExecutor);
	}

	/**
	 * Disposes of client resources.
	 * Call this when you're done using the client.
	 */
	public async dispose(): Promise<void> {
		if (this.disposed) return;

		this.disposed = true;
		await this.serverStats.dispose();
	}

	/**
	 * Ensures the client hasn't been disposed.
	 */
	private ensureNotDisposed(): void {
		if (this.disposed) {
			throw new RhinoComputeError(
				'GrasshopperClient has been disposed and cannot be used',
				ErrorCodes.INVALID_STATE
			);
		}
	}

	/**
	 * Validates and normalizes a compute configuration.
	 *
	 * @throws {RhinoComputeError} with code INVALID_CONFIG if configuration is invalid
	 */
	private normalizeComputeConfig<T extends ComputeConfig | GrasshopperComputeConfig>(config: T): T {
		return {
			...config,
			serverUrl: validateServerUrl(config.serverUrl),
			apiKey: config.apiKey,
			authToken: config.authToken,
			debug: config.debug ?? false,
			suppressBrowserWarning: config.suppressBrowserWarning ?? config.suppressClientSideWarning
		} as T;
	}
}
