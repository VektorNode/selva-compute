import { RhinoComputeError, ErrorCodes } from '../errors';
import { getLogger } from '../utils/logger';
import { validateServerUrl } from './validate-server-url';

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
	/** Timeout (ms) for the fast read/monitoring endpoints. */
	private static readonly DEFAULT_TIMEOUT_MS = 5000;

	/** Timeout (ms) for child-lifecycle POSTs — a cold Windows child can take ~30s to spawn. */
	private static readonly LIFECYCLE_TIMEOUT_MS = 60_000;

	constructor(serverUrl: string, apiKey?: string) {
		this.serverUrl = validateServerUrl(serverUrl);
		this.apiKey = apiKey;
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
	 * `fetch` wrapper that aborts after `timeoutMs` so a hung connection can't stall
	 * a probe (or the `monitor()` loop) forever. Pass `0` to disable the timeout.
	 */
	private fetchWithTimeout(
		url: string,
		init: RequestInit = {},
		timeoutMs: number = ComputeServerStats.DEFAULT_TIMEOUT_MS
	): Promise<Response> {
		const requestInit: RequestInit = { headers: this.buildHeaders(), ...init };
		if (timeoutMs > 0 && !requestInit.signal) {
			requestInit.signal = AbortSignal.timeout(timeoutMs);
		}
		return fetch(url, requestInit);
	}

	/**
	 * Check if the server is online.
	 *
	 * This is a single-sample probe: it returns `true` only on a 2xx from the
	 * proxy liveness root `/`, and `false` for every other outcome (non-2xx,
	 * network error, or timeout). A cold or briefly-busy-but-up server can therefore
	 * read as offline — callers that gate on this (e.g. client construction)
	 * should retry rather than treat a single `false` as authoritative.
	 *
	 * @param timeoutMs - Abort the probe after this many ms (default: 5000).
	 *   Pass `0` to disable the timeout. Prevents a hung connection from
	 *   stalling the caller indefinitely.
	 */
	public async isServerOnline(timeoutMs: number = 5000): Promise<boolean> {
		this.ensureNotDisposed();

		// The rhino.compute proxy has no `/healthcheck` route; its real liveness
		// signal is `GET /`, which returns "compute.rhino3d running". Probing an
		// unknown path would instead be forwarded to a child and only tells us the
		// proxy can reach one.
		const url = `${this.serverUrl}/`;

		try {
			const response = await this.fetchWithTimeout(url, { method: 'GET' }, timeoutMs);

			return response.ok;
		} catch (err) {
			getLogger().debug('[ComputeServerStats] Fetch error:', err);
			return false;
		}
	}

	/**
	 * Get the number of active child processes on the server.
	 *
	 * By default the proxy's `/activechildren` endpoint will *spawn* children up
	 * to the configured count if none are running, then report the count — which
	 * wakes (and bills) an idle server. Pass `{ initialize: false }` for a passive
	 * read that reports the current count without spawning; use this for
	 * monitoring or before a purge/probe where you must not wake the server.
	 *
	 * @param options.initialize - When `false`, append `?initialize=false` so the
	 *   server reports without spawning. Defaults to `true` (the server's default).
	 * @returns Number of active children, or null if unavailable
	 */
	public async getActiveChildren(options: { initialize?: boolean } = {}): Promise<number | null> {
		this.ensureNotDisposed();

		const { initialize = true } = options;
		const url = initialize
			? `${this.serverUrl}/activechildren`
			: `${this.serverUrl}/activechildren?initialize=false`;

		// `initialize` mode may spawn children before answering — give it the
		// lifecycle budget; the passive read stays on the short default.
		const timeoutMs = initialize
			? ComputeServerStats.LIFECYCLE_TIMEOUT_MS
			: ComputeServerStats.DEFAULT_TIMEOUT_MS;

		try {
			const response = await this.fetchWithTimeout(url, {}, timeoutMs);
			if (!response.ok) {
				getLogger().warn('[ComputeServerStats] Failed to fetch active children:', response.status);
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
			const response = await this.fetchWithTimeout(`${this.serverUrl}/version`);

			if (!response.ok) {
				getLogger().warn('[ComputeServerStats] Failed to fetch version:', response.status);
				return null;
			}

			// Read body as text first, then try JSON.parse — avoids the
			// "Body has already been read" error if response.json() fails.
			const text = await response.text();
			try {
				const json = JSON.parse(text);
				return {
					rhino: json.rhino ?? '',
					compute: json.compute ?? '',
					git_sha: json.git_sha ?? null
				};
			} catch {
				return { rhino: text, compute: '', git_sha: null };
			}
		} catch (err) {
			getLogger().warn('[ComputeServerStats] Error fetching version:', err);
			return null;
		}
	}

	/**
	 * Get the plugins installed on the server.
	 *
	 * Returns a `name → version` map of non-core plugins the server has loaded,
	 * or `null` if the request failed. Pass `kind` to choose which inventory:
	 * `'gh'` (default) lists Grasshopper add-on assemblies via
	 * `/plugins/gh/installed`; `'rhino'` lists Rhino plugins via
	 * `/plugins/rhino/installed`. Plugins that ship with Rhino / are core
	 * libraries are excluded by the server.
	 *
	 * @param kind - `'gh'` for Grasshopper add-ons (default) or `'rhino'` for Rhino plugins.
	 * @returns Map of plugin name to version, or `null` on failure.
	 *
	 * @example
	 * ```ts
	 * const gh = await stats.getInstalledPlugins();        // Grasshopper add-ons
	 * const selvaVersion = gh?.['Selva'] ?? null;
	 * ```
	 */
	public async getInstalledPlugins(
		kind: 'gh' | 'rhino' = 'gh'
	): Promise<Record<string, string> | null> {
		this.ensureNotDisposed();

		try {
			const response = await this.fetchWithTimeout(`${this.serverUrl}/plugins/${kind}/installed`);

			if (!response.ok) {
				getLogger().warn(`[ComputeServerStats] Failed to fetch ${kind} plugins:`, response.status);
				return null;
			}

			// Text-first so a non-JSON body can't throw "body already read".
			const text = await response.text();
			try {
				const json = JSON.parse(text);
				return json && typeof json === 'object' ? (json as Record<string, string>) : null;
			} catch {
				return null;
			}
		} catch (err) {
			getLogger().warn(`[ComputeServerStats] Error fetching ${kind} plugins:`, err);
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

		// Passive child count — never spawn from a stats read, or merely viewing
		// server health would wake (and bill) an idle server.
		const [version, activeChildren] = await Promise.all([
			this.getVersion(),
			this.getActiveChildren({ initialize: false })
		]);

		return {
			isOnline: true,
			...(version && { version }),
			...(activeChildren !== null && { activeChildren })
		};
	}

	/**
	 * Purge the server's solve-results / URL-data cache.
	 *
	 * POSTs to `cache/purge` and returns the number of entries removed, or `null`
	 * if the request failed. This clears cached solve responses and fetched
	 * definition-URL data; it does NOT evict the definition cache (active
	 * `pointer` references stay valid).
	 *
	 * **Caveat:** `cache/purge` is forwarded by the rhino.compute proxy to a
	 * single round-robin-selected child, so in a multi-child deployment one call
	 * purges one child's cache. Call repeatedly (or size the pool to 1) if you
	 * need a fleet-wide purge.
	 *
	 * @returns Number of entries removed, or `null` on failure.
	 *
	 * @example
	 * ```ts
	 * const removed = await stats.purgeCache();
	 * if (removed !== null) console.log(`Purged ${removed} cached solves`);
	 * ```
	 */
	public async purgeCache(): Promise<number | null> {
		this.ensureNotDisposed();

		try {
			const response = await this.fetchWithTimeout(`${this.serverUrl}/cache/purge`, {
				method: 'POST'
			});

			if (!response.ok) {
				getLogger().warn('[ComputeServerStats] Failed to purge cache:', response.status);
				return null;
			}

			// Read text-first so a non-JSON body can't throw "body already read".
			const text = await response.text();
			try {
				const json = JSON.parse(text);
				return typeof json.purged === 'number' ? json.purged : null;
			} catch {
				return null;
			}
		} catch (err) {
			getLogger().warn('[ComputeServerStats] Error purging cache:', err);
			return null;
		}
	}

	/**
	 * Best-effort fleet-wide cache purge across a multi-child deployment.
	 *
	 * A single {@link purgeCache} POST is forwarded by the rhino.compute proxy to
	 * just ONE round-robin-selected child, so the other children keep serving
	 * stale cached solves. There is no proxy endpoint that addresses children
	 * individually, so this method reads the active child count (passively, never
	 * spawning) and fires `2 × count` sequential purges, relying on the proxy's
	 * round-robin to spread the hits across the pool.
	 *
	 * **This is best-effort, not a guarantee.** Round-robin can revisit one child
	 * and skip another; under concurrent traffic the rotation drifts. The result's
	 * `confident` flag is `true` only when the server reports a single child (where
	 * one purge is exact) — surface it so callers don't over-promise. For a hard
	 * fleet-wide guarantee, run the deployment at `--childcount 1` or add a
	 * server-side fan-out endpoint.
	 *
	 * @returns `{ totalPurged, calls, children, confident }`, or `null` if the
	 *   child count couldn't be read (server unreachable). `totalPurged` sums the
	 *   per-call counts; `calls` is how many purges were issued; `children` is the
	 *   reported pool size; `confident` is `true` only at a single-child pool.
	 *
	 * @example
	 * ```ts
	 * const r = await stats.purgeAllChildren();
	 * if (r && !r.confident) {
	 *   console.warn(`Purged ~${r.totalPurged} across ${r.children} children (best-effort)`);
	 * }
	 * ```
	 */
	public async purgeAllChildren(): Promise<{
		totalPurged: number;
		calls: number;
		children: number;
		confident: boolean;
	} | null> {
		this.ensureNotDisposed();

		// Passive read — must not spawn children just to purge them.
		const children = await this.getActiveChildren({ initialize: false });
		if (children === null) {
			getLogger().warn('[ComputeServerStats] purgeAllChildren: could not read child count');
			return null;
		}

		if (children === 0) {
			// No live children means nothing is cached on the compute side.
			return { totalPurged: 0, calls: 0, children: 0, confident: true };
		}

		// 2× the pool size gives round-robin a strong chance of reaching every
		// child at least once. Sequential (not parallel) so the proxy advances its
		// round-robin cursor one child per call rather than racing them onto one.
		const calls = children * 2;
		let totalPurged = 0;
		for (let i = 0; i < calls; i++) {
			const purged = await this.purgeCache();
			if (purged !== null) totalPurged += purged;
		}

		return { totalPurged, calls, children, confident: children === 1 };
	}

	/**
	 * Get the server's current UTC clock.
	 *
	 * GETs `/servertime`, which the server emits as a JSON-encoded ISO-8601
	 * timestamp (e.g. `"2026-06-18T08:30:00Z"`). Useful for detecting clock skew
	 * between caller and server. Returns `null` if the request failed or the body
	 * isn't a parseable date.
	 *
	 * @returns A `Date` for the server's UTC time, or `null` on failure.
	 */
	public async getServerTime(): Promise<Date | null> {
		this.ensureNotDisposed();

		try {
			const response = await this.fetchWithTimeout(`${this.serverUrl}/servertime`);
			if (!response.ok) {
				getLogger().warn('[ComputeServerStats] Failed to fetch server time:', response.status);
				return null;
			}

			// Body is a JSON string ("2026-…Z"); strip surrounding quotes if present.
			const text = (await response.text()).trim().replace(/^"|"$/g, '');
			const date = new Date(text);
			return isNaN(date.getTime()) ? null : date;
		} catch (err) {
			getLogger().warn('[ComputeServerStats] Error fetching server time:', err);
			return null;
		}
	}

	/**
	 * Get how long the rhino.compute proxy has been idle.
	 *
	 * GETs `/idlespan` on the proxy, which returns the seconds elapsed since the
	 * last request was forwarded to a compute child. This is a proxy-level metric
	 * (not proxied to a child) used by autoscalers to decide when a node can be
	 * drained. Returns `null` if unavailable.
	 *
	 * @returns Idle time in seconds, or `null` on failure.
	 */
	public async getIdleSpan(): Promise<number | null> {
		this.ensureNotDisposed();

		try {
			const response = await this.fetchWithTimeout(`${this.serverUrl}/idlespan`);
			if (!response.ok) {
				getLogger().warn('[ComputeServerStats] Failed to fetch idle span:', response.status);
				return null;
			}
			const seconds = parseFloat((await response.text()).trim());
			return isNaN(seconds) ? null : seconds;
		} catch (err) {
			getLogger().warn('[ComputeServerStats] Error fetching idle span:', err);
			return null;
		}
	}

	/**
	 * Fill the compute child pool up to the server's configured baseline.
	 *
	 * POSTs `/launch-children`. No-op when the pool is already at or above the
	 * configured `--childcount`. Returns `{ spawned, active }` — how many children
	 * were started and the resulting child count — or `null` on failure.
	 *
	 * To raise capacity above the baseline use {@link launchChild}; the baseline
	 * itself can only be changed by restarting rhino.compute.
	 *
	 * @returns `{ spawned, active }`, or `null` on failure.
	 */
	public async launchChildren(): Promise<{ spawned: number[]; active: number } | null> {
		return this.postJson('/launch-children');
	}

	/**
	 * Add a single compute child to the pool, optionally on a specific port.
	 *
	 * POSTs `/launch-child` (with `?port=N` when `port` is given). Unlike
	 * {@link launchChildren}, this can push the pool above the baseline, up to the
	 * server's `MaxChildren` cap. Returns `{ spawned: [port] }` on success, or
	 * `null` on failure (server replies 400 for a bad port, 409 if the port is in
	 * use, 503 at the max-children cap).
	 *
	 * @param port - Optional specific port to launch on; otherwise the next free one.
	 * @returns `{ spawned }` listing the launched port, or `null` on failure.
	 */
	public async launchChild(port?: number): Promise<{ spawned: number[] } | null> {
		const path = port === undefined ? '/launch-child' : `/launch-child?port=${port}`;
		return this.postJson(path);
	}

	/**
	 * Gracefully shut down compute children without respawning them.
	 *
	 * POSTs `/shutdown-children`. With no `port` it shuts down every child; with
	 * `port` it targets just that one. Children do not respawn, but the next
	 * `/grasshopper` request auto-spawns the pool back to the baseline. Returns
	 * `{ shutdown, active }` — how many were stopped and the remaining count — or
	 * `null` on failure.
	 *
	 * @param port - Optional port to target; omit to shut down all children.
	 * @returns `{ shutdown, active }`, or `null` on failure.
	 */
	public async shutdownChildren(
		port?: number
	): Promise<{ shutdown: number; active: number } | null> {
		const path = port === undefined ? '/shutdown-children' : `/shutdown-children?port=${port}`;
		return this.postJson(path);
	}

	/**
	 * Shut down compute children and respawn replacements (rolling restart).
	 *
	 * POSTs `/recycle-children`. With no `port` it recycles every child; with
	 * `port` it recycles just that one. The server recycles sequentially (each
	 * replacement is serving before the next child is stopped) so the pool never
	 * drops to zero mid-recycle. Returns `{ shutdown, spawned, active }`, or
	 * `null` on failure.
	 *
	 * @param port - Optional port to target; omit to recycle all children.
	 * @returns `{ shutdown, spawned, active }`, or `null` on failure.
	 */
	public async recycleChildren(
		port?: number
	): Promise<{ shutdown: number; spawned: number[]; active: number } | null> {
		const path = port === undefined ? '/recycle-children' : `/recycle-children?port=${port}`;
		return this.postJson(path);
	}

	/**
	 * POST a control endpoint that replies with a JSON object and return it,
	 * degrading to `null` on any non-2xx, non-JSON, or network failure. Shared by
	 * the child-lifecycle methods so their failure semantics stay identical. Uses
	 * the longer lifecycle timeout since a spawn/recycle can take ~30s.
	 */
	private async postJson<T>(path: string): Promise<T | null> {
		this.ensureNotDisposed();

		try {
			const response = await this.fetchWithTimeout(
				`${this.serverUrl}${path}`,
				{ method: 'POST' },
				ComputeServerStats.LIFECYCLE_TIMEOUT_MS
			);
			if (!response.ok) {
				getLogger().warn(`[ComputeServerStats] POST ${path} failed:`, response.status);
				return null;
			}
			// Text-first so a non-JSON body can't throw "body already read".
			const text = await response.text();
			try {
				return JSON.parse(text) as T;
			} catch {
				return null;
			}
		} catch (err) {
			getLogger().warn(`[ComputeServerStats] Error on POST ${path}:`, err);
			return null;
		}
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

			try {
				const _stats = await this.getServerStats();

				// Check again after async operation to prevent race condition
				if (!active || this.disposed) return;

				try {
					callback(_stats);
				} catch (err) {
					getLogger().error('[ComputeServerStats] Monitor callback threw:', err);
				}
			} catch (err) {
				getLogger().error('[ComputeServerStats] Failed to fetch stats during monitor:', err);
			}

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
