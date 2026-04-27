import { RhinoComputeError, ErrorCodes } from '@/core/errors';
import type { RetryPolicy } from '@/core/types';
import { getLogger } from '@/core/utils/logger';

import type {
	DataTree,
	GrasshopperComputeResponse,
	GrasshopperComputeConfig
} from '../types';
import { hashSolveInput } from './stable-hash';

/**
 * Scheduling mode — controls how concurrent `solve()` calls interact.
 *
 * - `latest-wins`: One in flight at a time. New calls supersede any pending
 *   call (in-flight one is aborted). Optimal for slider scrubs / live UIs.
 * - `queue`: FIFO queue. Each solve runs to completion. Concurrency capped
 *   by `maxConcurrent`. Use for "submit job" flows where every request matters.
 * - `parallel`: No scheduling — calls run concurrently up to `maxConcurrent`.
 *   Closest to plain `client.solve()` but with shared cancel/state.
 */
export type SchedulerMode = 'latest-wins' | 'queue' | 'parallel';

export interface CacheOptions {
	/** Maximum entries kept in the LRU. Default: 50. */
	maxEntries?: number;
	/** Time-to-live in ms. Set to `0` for no expiry (default). */
	ttlMs?: number;
}

export interface SolveSchedulerOptions {
	mode?: SchedulerMode;
	maxConcurrent?: number;
	timeoutMs?: number;
	retry?: RetryPolicy;
	/** Enable response caching keyed by hash of (definition, dataTree). */
	cache?: boolean | CacheOptions;
	/** Lifecycle hooks — fired in order. Errors thrown by hooks are logged, not rethrown. */
	onStart?: (ctx: SolveContext) => void;
	onSettle?: (ctx: SolveContext, result: SolveResult) => void;
	onSuperseded?: (ctx: SolveContext) => void;
}

export interface SolveContext {
	/** Stable hash of (definition, dataTree). */
	key: string;
	/** Wall-clock timestamp when scheduler.solve() was called. */
	enqueuedAt: number;
	/** Wall-clock timestamp when execution actually started (after queueing). */
	startedAt: number | null;
}

export type SolveResult =
	| { status: 'success'; response: GrasshopperComputeResponse; durationMs: number; fromCache: boolean }
	| { status: 'error'; error: RhinoComputeError; durationMs: number }
	| { status: 'superseded' };

interface CacheEntry {
	response: GrasshopperComputeResponse;
	insertedAt: number;
}

interface PendingItem {
	definition: string | Uint8Array;
	dataTree: DataTree[];
	ctx: SolveContext;
	resolve: (response: GrasshopperComputeResponse) => void;
	reject: (error: RhinoComputeError) => void;
	externalSignal?: AbortSignal;
}

interface InFlightItem extends PendingItem {
	controller: AbortController;
}

/**
 * Adapter for the underlying solve function. Lets the scheduler be tested
 * without a real Compute server, and decouples it from the client class.
 */
export type SolveExecutor = (
	definition: string | Uint8Array,
	dataTree: DataTree[],
	config: GrasshopperComputeConfig
) => Promise<GrasshopperComputeResponse>;

/**
 * Robust scheduler for Grasshopper solves.
 *
 * Sits between your application code and the underlying compute call,
 * adding:
 * - Configurable scheduling (latest-wins for sliders, queue for jobs)
 * - In-flight cancellation (per-call signal + cancelAll)
 * - Optional response caching for repeated inputs
 * - Lifecycle hooks for UI indicators (start / settle / superseded)
 * - State observability via subscribe()
 *
 * Multiple schedulers can share a single GrasshopperClient — typically one
 * per UI surface (e.g. one for slider scrubs, one for long-running submits).
 *
 * @example
 * ```ts
 * const scheduler = client.createScheduler({ mode: 'latest-wins', timeoutMs: 30_000 });
 *
 * // From a slider handler:
 * scheduler.solve(definition, tree).then((result) => {
 *   updateMeshes(result);
 * }).catch((err) => {
 *   if (err.code !== 'SUPERSEDED') showError(err);
 * });
 *
 * // From a UI binding:
 * scheduler.subscribe(() => {
 *   showSpinner = scheduler.isSolving;
 * });
 * ```
 */
export class SolveScheduler {
	private readonly executor: SolveExecutor;
	private readonly baseConfig: GrasshopperComputeConfig;

	private readonly mode: SchedulerMode;
	private readonly maxConcurrent: number;
	private readonly timeoutMs: number | undefined;
	private readonly retry: RetryPolicy | undefined;

	private readonly cacheEnabled: boolean;
	private readonly cacheMax: number;
	private readonly cacheTtl: number;
	private readonly cache = new Map<string, CacheEntry>();

	private readonly onStart?: SolveSchedulerOptions['onStart'];
	private readonly onSettle?: SolveSchedulerOptions['onSettle'];
	private readonly onSuperseded?: SolveSchedulerOptions['onSuperseded'];

	private readonly subscribers = new Set<() => void>();

	private readonly inFlight = new Set<InFlightItem>();
	private pendingForLatestWins: PendingItem | null = null;
	private readonly fifoQueue: PendingItem[] = [];

	private _lastResult: GrasshopperComputeResponse | null = null;
	private _lastError: RhinoComputeError | null = null;
	private _lastDurationMs: number | null = null;

	private disposed = false;

	constructor(
		executor: SolveExecutor,
		baseConfig: GrasshopperComputeConfig,
		options: SolveSchedulerOptions = {}
	) {
		this.executor = executor;
		this.baseConfig = baseConfig;
		this.mode = options.mode ?? 'latest-wins';
		this.maxConcurrent = Math.max(1, options.maxConcurrent ?? (this.mode === 'parallel' ? 4 : 1));
		this.timeoutMs = options.timeoutMs;
		this.retry = options.retry;

		const cacheOpt = options.cache;
		this.cacheEnabled = cacheOpt !== undefined && cacheOpt !== false;
		const cacheConfig = typeof cacheOpt === 'object' ? cacheOpt : {};
		this.cacheMax = cacheConfig.maxEntries ?? 50;
		this.cacheTtl = cacheConfig.ttlMs ?? 0;

		this.onStart = options.onStart;
		this.onSettle = options.onSettle;
		this.onSuperseded = options.onSuperseded;
	}

	// --------------------------------------------------------------------------
	// Public state
	// --------------------------------------------------------------------------

	get isSolving(): boolean {
		return this.inFlight.size > 0;
	}

	get hasPending(): boolean {
		return this.pendingForLatestWins !== null || this.fifoQueue.length > 0;
	}

	get inFlightCount(): number {
		return this.inFlight.size;
	}

	get queueDepth(): number {
		return this.fifoQueue.length + (this.pendingForLatestWins ? 1 : 0);
	}

	get lastResult(): GrasshopperComputeResponse | null {
		return this._lastResult;
	}

	get lastError(): RhinoComputeError | null {
		return this._lastError;
	}

	get lastDurationMs(): number | null {
		return this._lastDurationMs;
	}

	// --------------------------------------------------------------------------
	// Subscribe — minimal observable. Called whenever observable state changes.
	// --------------------------------------------------------------------------

	subscribe(listener: () => void): () => void {
		this.subscribers.add(listener);
		return () => this.subscribers.delete(listener);
	}

	private notify(): void {
		for (const listener of this.subscribers) {
			try {
				listener();
			} catch (err) {
				getLogger().error('[SolveScheduler] subscriber threw:', err);
			}
		}
	}

	// --------------------------------------------------------------------------
	// solve()
	// --------------------------------------------------------------------------

	/**
	 * Schedule a solve. Returns a promise that:
	 * - Resolves with the compute response on success.
	 * - Rejects with `RhinoComputeError` on failure.
	 * - Rejects with `code: ErrorCodes.UNKNOWN_ERROR` and `message: 'Superseded'`
	 *   when the call was canceled because newer values arrived (latest-wins mode).
	 *
	 * Caller-supplied `signal` cancels just this call (rejects with abort error).
	 */
	solve(
		definition: string | Uint8Array,
		dataTree: DataTree[],
		options?: { signal?: AbortSignal }
	): Promise<GrasshopperComputeResponse> {
		if (this.disposed) {
			return Promise.reject(
				new RhinoComputeError(
					'SolveScheduler has been disposed and cannot be used',
					ErrorCodes.INVALID_STATE
				)
			);
		}

		const key = hashSolveInput(definition, dataTree);
		const ctx: SolveContext = {
			key,
			enqueuedAt: Date.now(),
			startedAt: null
		};

		// Cache hit — return synchronously-resolved promise
		if (this.cacheEnabled) {
			const cached = this.readCache(key);
			if (cached) {
				const result: SolveResult = {
					status: 'success',
					response: cached,
					durationMs: 0,
					fromCache: true
				};
				this._lastResult = cached;
				this._lastError = null;
				this._lastDurationMs = 0;
				this.runHook(this.onStart, ctx);
				this.runHook(this.onSettle, ctx, result);
				this.notify();
				return Promise.resolve(cached);
			}
		}

		return new Promise<GrasshopperComputeResponse>((resolve, reject) => {
			const item: PendingItem = {
				definition,
				dataTree,
				ctx,
				resolve,
				reject,
				externalSignal: options?.signal
			};

			// External signal cancellation — reject immediately if already aborted
			if (item.externalSignal?.aborted) {
				reject(this.makeAbortError(ctx));
				return;
			}

			this.enqueue(item);
		});
	}

	private enqueue(item: PendingItem): void {
		switch (this.mode) {
			case 'latest-wins': {
				// Reject any pending one as superseded
				if (this.pendingForLatestWins) {
					this.supersede(this.pendingForLatestWins);
					this.pendingForLatestWins = null;
				}
				// Abort any in-flight one as superseded
				for (const inflight of this.inFlight) {
					this.supersede(inflight);
					inflight.controller.abort();
				}
				// Run immediately if no slot is taken
				if (this.inFlight.size === 0) {
					this.execute(item);
				} else {
					this.pendingForLatestWins = item;
				}
				break;
			}

			case 'queue': {
				if (this.inFlight.size < this.maxConcurrent) {
					this.execute(item);
				} else {
					this.fifoQueue.push(item);
				}
				break;
			}

			case 'parallel': {
				if (this.inFlight.size < this.maxConcurrent) {
					this.execute(item);
				} else {
					this.fifoQueue.push(item);
				}
				break;
			}
		}
		this.notify();
	}

	private async execute(item: PendingItem): Promise<void> {
		const controller = new AbortController();
		const inflight: InFlightItem = { ...item, controller };
		this.inFlight.add(inflight);
		item.ctx.startedAt = Date.now();

		const externalAbortHandler = () => controller.abort();
		item.externalSignal?.addEventListener('abort', externalAbortHandler, { once: true });

		this.runHook(this.onStart, item.ctx);
		this.notify();

		const startTime = performance.now();
		try {
			const config: GrasshopperComputeConfig = {
				...this.baseConfig,
				signal: controller.signal,
				...(this.timeoutMs !== undefined && { timeoutMs: this.timeoutMs }),
				...(this.retry !== undefined && { retry: this.retry })
			};

			const response = await this.executor(item.definition, item.dataTree, config);
			const durationMs = performance.now() - startTime;

			if (this.cacheEnabled) this.writeCache(item.ctx.key, response);

			this._lastResult = response;
			this._lastError = null;
			this._lastDurationMs = durationMs;

			item.resolve(response);
			this.runHook(this.onSettle, item.ctx, {
				status: 'success',
				response,
				durationMs,
				fromCache: false
			});
		} catch (error) {
			const durationMs = performance.now() - startTime;
			const err =
				error instanceof RhinoComputeError
					? error
					: new RhinoComputeError(
							error instanceof Error ? error.message : String(error),
							ErrorCodes.UNKNOWN_ERROR,
							{ originalError: error instanceof Error ? error : new Error(String(error)) }
						);

			this._lastError = err;
			this._lastDurationMs = durationMs;

			item.reject(err);
			this.runHook(this.onSettle, item.ctx, { status: 'error', error: err, durationMs });
		} finally {
			item.externalSignal?.removeEventListener('abort', externalAbortHandler);
			this.inFlight.delete(inflight);
			this.drainNext();
			this.notify();
		}
	}

	private drainNext(): void {
		if (this.disposed) return;

		// latest-wins: promote pending if no in-flight
		if (this.mode === 'latest-wins') {
			if (this.pendingForLatestWins && this.inFlight.size === 0) {
				const next = this.pendingForLatestWins;
				this.pendingForLatestWins = null;
				this.execute(next);
			}
			return;
		}

		// queue / parallel: pull from FIFO until at capacity
		while (this.fifoQueue.length > 0 && this.inFlight.size < this.maxConcurrent) {
			const next = this.fifoQueue.shift()!;
			this.execute(next);
		}
	}

	private supersede(item: PendingItem): void {
		const err = new RhinoComputeError('Superseded by newer solve', ErrorCodes.UNKNOWN_ERROR, {
			context: { key: item.ctx.key, enqueuedAt: item.ctx.enqueuedAt }
		});
		item.reject(err);
		this.runHook(this.onSuperseded, item.ctx);
	}

	private makeAbortError(ctx: SolveContext): RhinoComputeError {
		return new RhinoComputeError('Request aborted by caller', ErrorCodes.UNKNOWN_ERROR, {
			context: { key: ctx.key, enqueuedAt: ctx.enqueuedAt }
		});
	}

	// --------------------------------------------------------------------------
	// Cancellation
	// --------------------------------------------------------------------------

	/** Cancel everything — in-flight and pending. */
	cancelAll(): void {
		// Reject pending
		if (this.pendingForLatestWins) {
			this.pendingForLatestWins.reject(this.makeAbortError(this.pendingForLatestWins.ctx));
			this.pendingForLatestWins = null;
		}
		while (this.fifoQueue.length > 0) {
			const item = this.fifoQueue.shift()!;
			item.reject(this.makeAbortError(item.ctx));
		}
		// Abort in-flight — their finally blocks will reject their promises
		for (const inflight of this.inFlight) {
			inflight.controller.abort();
		}
		this.notify();
	}

	// --------------------------------------------------------------------------
	// Cache
	// --------------------------------------------------------------------------

	private readCache(key: string): GrasshopperComputeResponse | null {
		if (!this.cacheEnabled) return null;
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (this.cacheTtl > 0 && Date.now() - entry.insertedAt > this.cacheTtl) {
			this.cache.delete(key);
			return null;
		}
		// LRU touch
		this.cache.delete(key);
		this.cache.set(key, entry);
		return entry.response;
	}

	private writeCache(key: string, response: GrasshopperComputeResponse): void {
		if (!this.cacheEnabled) return;
		this.cache.set(key, { response, insertedAt: Date.now() });
		while (this.cache.size > this.cacheMax) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}
	}

	clearCache(): void {
		this.cache.clear();
	}

	// --------------------------------------------------------------------------
	// Lifecycle
	// --------------------------------------------------------------------------

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.cancelAll();
		this.subscribers.clear();
		this.cache.clear();
	}

	private runHook<H extends (...args: any[]) => void>(
		hook: H | undefined,
		...args: Parameters<H>
	): void {
		if (!hook) return;
		try {
			hook(...args);
		} catch (err) {
			getLogger().error('[SolveScheduler] hook threw:', err);
		}
	}
}
