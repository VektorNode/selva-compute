import { RhinoComputeError, ErrorCodes } from '../errors';
import { getLogger } from '../utils/logger';

/**
 * ComputeServerStats provides methods to query Rhino Compute server statistics.
 *
 * @public Use this for server health monitoring and statistics.
 *
 * @example
 * ```typescript
 * const stats = new ComputeServerStats('http://localhost:6500', 'your-api-key');
 *
 * try {
 *   const isOnline = await stats.isServerOnline();
 *   const children = await stats.getActiveChildren();
 *   const version = await stats.getVersion();
 *
 *   // Or get everything at once
 *   const allStats = await stats.getServerStats();
 * } finally {
 *   await stats.dispose(); // Clean up resources
 * }
 * ```
 */
export default class ComputeServerStats {
	private readonly serverUrl: string;
	private readonly apiKey?: string;
	private disposed = false;
	private activeMonitors: Set<() => void> = new Set();
	private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

	/**
	 * @param serverUrl - Base URL of the Rhino Compute server with http:// or https:// scheme (e.g., 'http://localhost:6500')
	 * @param apiKey - Optional API key for authentication
	 */
	constructor(serverUrl: string, apiKey?: string) {
		if (!serverUrl?.trim()) {
			throw new RhinoComputeError(
				'serverUrl is required',
				ErrorCodes.INVALID_CONFIG,
				{ context: { serverUrl } }
			);
		}

		// Validate URL has http:// or https:// scheme
		if (!serverUrl.match(/^https?:\/\//)) {
			throw new RhinoComputeError(
				`Invalid serverUrl: "${serverUrl}". Must start with "http://" or "https://". ` +
				`For example: "http://localhost:5000" or "https://example.com"`,
				ErrorCodes.INVALID_CONFIG,
				{ context: { serverUrl } }
			);
		}

		try {
			new URL(serverUrl);
		} catch (err) {
			throw new RhinoComputeError(
				`Invalid serverUrl: "${serverUrl}". Must be a valid URL. ` +
				`Received error: ${err instanceof Error ? err.message : String(err)}`,
				ErrorCodes.INVALID_CONFIG,
				{
					context: { serverUrl },
					originalError: err instanceof Error ? err : undefined
				}
			);
		}

		this.apiKey = apiKey;
		this.serverUrl = serverUrl.replace(/\/+$/, '');
	}

	/**
	 * Build request headers with optional API key.
	 */
	private buildHeaders(): HeadersInit {
		const headers: HeadersInit = {
			'Content-Type': 'application/json'
		};

		if (this.apiKey) {
			headers['RhinoComputeKey'] = this.apiKey;
		}

		return headers;
	}

	/**
	 * Check if the server is online.
	 */
	public async isServerOnline(): Promise<boolean> {
		this.ensureNotDisposed();

		const url = `${this.serverUrl}/healthcheck`;
		const init: RequestInit = { headers: this.buildHeaders(), method: 'GET' };

		try {
			const response = await fetch(url, init);

			return response.ok;
		} catch (err) {
			getLogger().debug('[ComputeServerStats] Fetch error:', err);
			return false;
		}
	}

	/**
	 * Get the number of active child processes on the server.
	 *
	 * @returns Number of active children, or null if unavailable
	 */
	public async getActiveChildren(): Promise<number | null> {
		this.ensureNotDisposed();

		try {
			const response = await fetch(`${this.serverUrl}/activechildren`, {
				headers: this.buildHeaders()
			});
			if (!response.ok) {
				getLogger().warn(
					'[ComputeServerStats] Failed to fetch active children:',
					response.status
				);
				return null;
			}

			const text = await response.text();
			const count = parseInt(text.trim(), 10);

			if (isNaN(count)) {
				getLogger().warn('[ComputeServerStats] Invalid active children response:', text);
				return null;
			}

			return count;
		} catch (err) {
			getLogger().warn('[ComputeServerStats] Error fetching active children:', err);
			return null;
		}
	}

	/**
	 * Get the server version information.
	 *
	 * @returns Version object with rhino, compute, and git_sha, or null if unavailable
	 */
	public async getVersion(): Promise<{
		rhino: string;
		compute: string;
		git_sha: string | null;
	} | null> {
		this.ensureNotDisposed();

		try {
			const response = await fetch(`${this.serverUrl}/version`, {
				headers: this.buildHeaders()
			});

			if (!response.ok) {
				getLogger().warn('[ComputeServerStats] Failed to fetch version:', response.status);
				return null;
			}

			try {
				const json = await response.json();
				return {
					rhino: json.rhino ?? '',
					compute: json.compute ?? '',
					git_sha: json.git_sha ?? null
				};
			} catch {
				// Fallback: parse as plain text
				const text = await response.text();
				return { rhino: text, compute: '', git_sha: null };
			}
		} catch (err) {
			getLogger().warn('[ComputeServerStats] Error fetching version:', err);
			return null;
		}
	}

	/**
	 * Get comprehensive server statistics.
	 * Fetches all available server information in parallel.
	 *
	 * @returns Object containing server status and available stats
	 */
	public async getServerStats(): Promise<{
		isOnline: boolean;
		version?: { rhino: string; compute: string; git_sha: string | null };
		activeChildren?: number;
	}> {
		this.ensureNotDisposed();

		const isOnline = await this.isServerOnline();

		if (!isOnline) {
			return { isOnline: false };
		}

		const [version, activeChildren] = await Promise.all([
			this.getVersion(),
			this.getActiveChildren()
		]);

		return {
			isOnline: true,
			...(version && { version }),
			...(activeChildren !== null && { activeChildren })
		};
	}

	/**
	 * Continuously monitor server stats at specified interval.
	 *
	 * @param callback - Function called with stats on each interval
	 * @param intervalMs - Milliseconds between checks (default: 5000)
	 * @returns Function to stop monitoring
	 *
	 * @example
	 * ```typescript
	 * const stopMonitoring = stats.monitor((data) => {
	 *   console.log('Server stats:', data);
	 * }, 3000);
	 *
	 * // Later...
	 * stopMonitoring();
	 * ```
	 */
	public monitor(
		callback: (stats: Awaited<ReturnType<typeof this.getServerStats>>) => void,
		intervalMs: number = 5000
	): () => void {
		this.ensureNotDisposed();

		let active = true;
		let currentTimeoutId: ReturnType<typeof setTimeout> | null = null;

		getLogger().info(`🔄 Starting server stats monitoring every ${intervalMs}ms`);

		const check = async () => {
			// Clear current timeout from tracking since it has fired
			if (currentTimeoutId !== null) {
				this.activeTimeouts.delete(currentTimeoutId);
				currentTimeoutId = null;
			}

			if (!active || this.disposed) return;

			const _stats = await this.getServerStats();

			// Check again after async operation to prevent race condition
			if (!active || this.disposed) return;

			callback(_stats);

			if (active && !this.disposed) {
				currentTimeoutId = setTimeout(() => void check(), intervalMs);
				this.activeTimeouts.add(currentTimeoutId);
			}
		};

		const stopMonitoring = () => {
			active = false;

			// Clear any pending timeout
			if (currentTimeoutId !== null) {
				clearTimeout(currentTimeoutId);
				this.activeTimeouts.delete(currentTimeoutId);
				currentTimeoutId = null;
			}

			this.activeMonitors.delete(stopMonitoring);
		};

		this.activeMonitors.add(stopMonitoring);

		// Explicitly mark as fire-and-forget since we don't need to await the initial call
		void check();

		return stopMonitoring;
	}

	/**
	 * Disposes of all resources and stops all active monitors.
	 * Call this when you're done using the stats instance.
	 */
	public async dispose(): Promise<void> {
		if (this.disposed) return;

		this.disposed = true;

		// Stop all active monitors (this will also clear their timeouts)
		for (const stopMonitor of this.activeMonitors) {
			stopMonitor();
		}
		this.activeMonitors.clear();

		// Clear any remaining timeouts (defensive cleanup)
		for (const timeoutId of this.activeTimeouts) {
			clearTimeout(timeoutId);
		}
		this.activeTimeouts.clear();
	}

	/**
	 * Ensures the instance hasn't been disposed.
	 */
	private ensureNotDisposed(): void {
		if (this.disposed) {
			throw new RhinoComputeError(
				'ComputeServerStats has been disposed and cannot be used',
				ErrorCodes.INVALID_STATE,
				{ context: { disposed: this.disposed } }
			);
		}
	}
}
