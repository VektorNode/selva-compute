import { ErrorCodes } from '@/core/errors';
import { RhinoComputeError } from '@/core/errors/base';
import { getLogger } from '@/core/utils/logger';
import ComputeServerStats from '@/core/server/compute-server-stats';
import { ComputeConfig } from '@/core/types';

import { fetchDefinitionIO, fetchParsedDefinitionIO, solveGrasshopperDefinition } from '..';
import { GrasshopperComputeConfig, GrasshopperComputeResponse, DataTree } from '../types';

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
	 * @throws {RhinoComputeError} with code NETWORK_ERROR if server is offline
	 * @throws {RhinoComputeError} with code INVALID_CONFIG if configuration is invalid
	 */
	static async create(config: GrasshopperComputeConfig): Promise<GrasshopperClient> {
		const client = new GrasshopperClient(config);

		// Check server is online before returning
		if (!(await client.serverStats.isServerOnline())) {
			throw new RhinoComputeError('Rhino Compute server is not online', ErrorCodes.NETWORK_ERROR, {
				context: { serverUrl: client.config.serverUrl }
			});
		}

		return client;
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
		dataTree: DataTree[]
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

			// Check server
			if (!(await this.serverStats.isServerOnline())) {
				throw new RhinoComputeError(
					'Rhino Compute server is not online',
					ErrorCodes.NETWORK_ERROR,
					{ context: { serverUrl: this.config.serverUrl } }
				);
			}

			// Run computation
			const result = await solveGrasshopperDefinition(dataTree, definition, this.config);

			// Check for errors
			if (result && typeof result === 'object' && 'message' in result && !('fileData' in result)) {
				throw new RhinoComputeError(
					(result as { message: string }).message || 'Computation failed',
					ErrorCodes.COMPUTATION_ERROR,
					{
						context: {
							definition:
								typeof definition === 'string' && definition.length < 200
									? definition
									: '...content...',
							inputs: dataTree
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
	 * Disposes of client resources.
	 * Call this when you're done using the client.
	 */
	public async dispose(): Promise<void> {
		if (this.disposed) return;

		this.disposed = true;

		// If serverStats has a dispose method, call it
		if ('dispose' in this.serverStats && typeof this.serverStats.dispose === 'function') {
			await this.serverStats.dispose();
		}

		// Clear any cached data or connections if needed
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
		if (!config.serverUrl?.trim()) {
			throw new RhinoComputeError('serverUrl is required', ErrorCodes.INVALID_CONFIG, {
				context: { receivedServerUrl: config.serverUrl }
			});
		}

		// Validate URL format
		try {
			new URL(config.serverUrl);
		} catch {
			throw new RhinoComputeError('serverUrl must be a valid URL', ErrorCodes.INVALID_CONFIG, {
				context: { receivedServerUrl: config.serverUrl }
			});
		}

		// Validate that it's not the default public endpoint
		if (config.serverUrl === '' || config.serverUrl === 'https://compute.rhino3d.com/') {
			throw new RhinoComputeError(
				'serverUrl must be set to your Compute server URL. The default public endpoint is not allowed.',
				ErrorCodes.INVALID_CONFIG,
				{ context: { receivedServerUrl: config.serverUrl } }
			);
		}

		return {
			...config,
			serverUrl: config.serverUrl.replace(/\/+$/, ''), // Remove trailing slashes
			apiKey: config.apiKey,
			authToken: config.authToken,
			debug: config.debug ?? false,
			suppressClientSideWarning: config.suppressClientSideWarning
		} as T;
	}
}
