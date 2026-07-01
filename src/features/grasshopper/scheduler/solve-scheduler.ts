import { RhinoComputeError, ErrorCodes } from '@/core/errors';
import type { RetryPolicy } from '@/core/types';
import { getLogger } from '@/core/utils/logger';

import type { DataTree, GrasshopperComputeResponse, GrasshopperComputeConfig } from '../types';
import { hashSolveInput, hashDefinition } from './stable-hash';

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
	/**
	 * Reuse the server's definition cache key so a large (base64/binary)
	 * definition is uploaded once and subsequent solves reference it by
	 * `pointer` instead of re-sending the full payload. Hugely cheaper for
	 * multi-MB definitions on a live UI (slider scrubs, etc.).
	 *
	 * Requires a `cacheKeyExecutor` to be supplied (the client wires one). Has no
	 * effect for URL-pointer definitions (already a reference). On a server-side
	 * cache miss the executor transparently falls back to a full upload, so this
	 * is safe to leave on. Default: `true` when a `cacheKeyExecutor` is present.
	 */
	reuseServerDefinitionCache?: boolean;
	/** Lifecycle hooks — fired in order. Errors thrown by hooks are logged, not rethrown. */
	onStart?: (ctx: SolveContext) => void;
	onSettle?: (ctx: SolveContext, result: SolveResult) => void;
	onSuperseded?: (ctx: SolveContext) => void;
}

export interface SolveContext {
	/** Stable hash of (definition, dataTree). */
	key: string;
	/** Timestamp when scheduler.solve() was called. */
	enqueuedAt: number;
	/** Timestamp when execution actually started (after queueing). */
	startedAt: number | null;
}

export type SolveResult =
	| {
			status: 'success';
			response: GrasshopperComputeResponse;
			durationMs: number;
			fromCache: boolean;
			/**
			 * Definition-cache telemetry for a real compute call (not a Selva-cache
			 * `fromCache` hit). `false` → the server reused its cached definition via
			 * the pointer (no upload); `true` → the pointer was cold/stale so the full
			 * definition was re-uploaded. `undefined` when the server-definition-cache
			 * fast path didn't run (reuse disabled, or a non-reusable definition such
			 * as a remote URL).
			 */
			definitionReuploaded?: boolean;
	  }
	| { status: 'error'; error: RhinoComputeError; durationMs: number }
	| { status: 'superseded' };

interface CacheEntry {
	response: GrasshopperComputeResponse;
	insertedAt: number;
}

/** Cap on the definition→server-cache-key map so it can't grow without bound. */
const SERVER_CACHE_KEYS_MAX = 100;

interface PendingItem {
	definition: string | Uint8Array;
	dataTree: DataTree[];
	ctx: SolveContext;
	resolve: (response: GrasshopperComputeResponse) => void;
	reject: (error: RhinoComputeError) => void;
	externalSignal?: AbortSignal;
	/** Set once the promise has been settled, so a late executor rejection becomes a no-op. */
	settled?: { error: RhinoComputeError } | { ok: true };
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
 * Cache-key-aware executor. When `cacheKey` is provided, the executor solves by
 * reference (`pointer: cacheKey`) and falls back to a full upload on a server
 * cache miss. Always reports the (possibly refreshed) `cacheKey` so the
 * scheduler can update its definition→key map, plus whether the fast path
 * `missed` (for telemetry). When `cacheKey` is null it's a first solve — upload
 * fully and capture the key the server assigns.
 *
 * Supplied by the client (which owns the solve primitives); the scheduler stays
 * decoupled from the transport.
 */
export type CacheKeyExecutor = (
	definition: string | Uint8Array,
	dataTree: DataTree[],
	cacheKey: string | null,
	config: GrasshopperComputeConfig
) => Promise<{ response: GrasshopperComputeResponse; cacheKey: string | null; missed: boolean }>;

/**
 * Whether a definition is worth solving by server cache key. Binary and
 * base64/plain-string definitions are uploaded in full, so referencing them by
 * key on later solves saves the (potentially huge) payload. An `http(s)://` URL
 * is already a reference — the server keys it by URL and there's nothing to
 * re-upload — so the fast path adds no value there.
 */
function isReusableDefinition(definition: string | Uint8Array): boolean {
	if (definition instanceof Uint8Array) return true;
	return !/^https?:\/\//i.test(definition);
}

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

	/** Optional cache-key-aware executor and whether server-def-cache reuse is on. */
	private readonly cacheKeyExecutor?: CacheKeyExecutor;
	private readonly reuseServerDefinitionCache: boolean;
	/** definition identity → server cache key (`pointer`) learned from past solves. */
	private readonly serverCacheKeys = new Map<string, string>();

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
		options: SolveSchedulerOptions = {},
		cacheKeyExecutor?: CacheKeyExecutor
	) {
		this.executor = executor;
		this.cacheKeyExecutor = cacheKeyExecutor;
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

		// On by default when the client wired a cache-key executor — it's a pure
		// win for reusable definitions and falls back safely on a miss.
		this.reuseServerDefinitionCache =
			!!cacheKeyExecutor && (options.reuseServerDefinitionCache ?? true);

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
	 * - Rejects with `code: ErrorCodes.SUPERSEDED` when the call was canceled because
	 *   newer values arrived (latest-wins mode).
	 * - Rejects with `code: ErrorCodes.ABORTED` when the call was canceled via
	 *   caller-supplied signal or `cancelAll()`.
	 *
	 * Caller-supplied `signal` cancels just this call (rejects with `ABORTED`).
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
				this.settleError(item, this.makeAbortError(ctx));
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

			case 'queue':
			case 'parallel': {
				// Same dispatch logic — the modes differ only in `maxConcurrent`'s
				// default (1 for queue, 4 for parallel), set in the constructor.
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
		// Attach the controller to the SAME object (not a spread copy) so every
		// settle path — supersede, cancelAll, executor success/error — shares one
		// `settled` slot. A copy would split that state and fire onSettle twice.
		const inflight = item as InFlightItem;
		inflight.controller = controller;
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

			const { response, definitionReuploaded } = await this.runExecutor(
				item.definition,
				item.dataTree,
				config
			);
			const durationMs = performance.now() - startTime;

			if (this.cacheEnabled) this.writeCache(item.ctx.key, response);

			// Already superseded mid-flight — drop the late success silently.
			if (!this.settleSuccess(item, response)) return;

			this._lastResult = response;
			this._lastError = null;
			this._lastDurationMs = durationMs;

			this.runHook(this.onSettle, item.ctx, {
				status: 'success',
				response,
				durationMs,
				fromCache: false,
				definitionReuploaded
			});
		} catch (error) {
			const durationMs = performance.now() - startTime;
			// Resolve the error against the (possibly already-settled) item *before*
			// settling: if this was superseded mid-flight, normalizeExecutionError
			// returns the original cause, and _lastError must reflect it either way.
			const err = this.normalizeExecutionError(error, inflight);

			this._lastError = err;
			this._lastDurationMs = durationMs;

			if (this.settleError(item, err)) {
				this.runHook(this.onSettle, item.ctx, { status: 'error', error: err, durationMs });
			}
		} finally {
			item.externalSignal?.removeEventListener('abort', externalAbortHandler);
			this.inFlight.delete(inflight);
			this.drainNext();
			this.notify();
		}
	}

	/**
	 * Run the solve, using the server-definition-cache fast path when it's
	 * enabled and the definition is reusable. Learns/updates the definition's
	 * server cache key from the result so later solves can reference it.
	 */
	private async runExecutor(
		definition: string | Uint8Array,
		dataTree: DataTree[],
		config: GrasshopperComputeConfig
	): Promise<{ response: GrasshopperComputeResponse; definitionReuploaded?: boolean }> {
		if (
			!this.cacheKeyExecutor ||
			!this.reuseServerDefinitionCache ||
			!isReusableDefinition(definition)
		) {
			return { response: await this.executor(definition, dataTree, config) };
		}

		const defKey = hashDefinition(definition);
		const knownKey = this.serverCacheKeys.get(defKey) ?? null;

		const result = await this.cacheKeyExecutor(definition, dataTree, knownKey, config);

		// Record the server's (possibly refreshed) key for next time; drop a stale
		// one if the server stopped returning a key. Re-set on a hit to refresh
		// insertion order so the bounded eviction below is LRU-ish.
		if (result.cacheKey) {
			this.serverCacheKeys.delete(defKey);
			this.serverCacheKeys.set(defKey, result.cacheKey);
			while (this.serverCacheKeys.size > SERVER_CACHE_KEYS_MAX) {
				const oldest = this.serverCacheKeys.keys().next().value;
				if (oldest === undefined) break;
				this.serverCacheKeys.delete(oldest);
			}
		} else {
			this.serverCacheKeys.delete(defKey);
		}

		return { response: result.response, definitionReuploaded: result.missed };
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
		const err = new RhinoComputeError('Superseded by newer solve', ErrorCodes.SUPERSEDED, {
			context: { key: item.ctx.key, enqueuedAt: item.ctx.enqueuedAt }
		});
		if (this.settleError(item, err)) {
			this.runHook(this.onSuperseded, item.ctx);
		}
	}

	private makeAbortError(ctx: SolveContext): RhinoComputeError {
		return new RhinoComputeError('Request aborted by caller', ErrorCodes.ABORTED, {
			context: { key: ctx.key, enqueuedAt: ctx.enqueuedAt }
		});
	}

	/**
	 * Settle a pending/in-flight item exactly once with an error.
	 *
	 * A solve promise can be settled from four concurrent sources — the executor
	 * resolving, the executor rejecting, `supersede`, and `cancelAll` — and a JS
	 * promise silently ignores a second settle. This guard is the single place the
	 * settle-once invariant lives: it makes the *first* settle win and reports
	 * whether this call was that winner, so callers fire their own hook only when
	 * they actually settled. Any new settle path must go through here (or
	 * {@link settleSuccess}) so the guard can't be forgotten.
	 *
	 * @returns `true` if this call settled the item; `false` if it was already settled.
	 */
	private settleError(item: PendingItem, err: RhinoComputeError): boolean {
		if (item.settled) return false;
		item.settled = { error: err };
		item.reject(err);
		return true;
	}

	/**
	 * Settle a pending/in-flight item exactly once with a successful response.
	 * The success counterpart to {@link settleError}; see it for the invariant.
	 *
	 * @returns `true` if this call settled the item; `false` if it was already settled.
	 */
	private settleSuccess(item: PendingItem, response: GrasshopperComputeResponse): boolean {
		if (item.settled) return false;
		item.settled = { ok: true };
		item.resolve(response);
		return true;
	}

	private isAbortLikeError(error: unknown): boolean {
		if (error instanceof Error) {
			if (error.name === 'AbortError') return true;
			if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
				return error.name === 'AbortError';
			}
		}
		return false;
	}

	private normalizeExecutionError(error: unknown, item: InFlightItem): RhinoComputeError {
		// If the item was already settled (e.g. by supersede), return that error so
		// _lastError reflects the original cause rather than the downstream abort.
		if (item.settled && 'error' in item.settled) {
			return item.settled.error;
		}

		if (error instanceof RhinoComputeError) return error;

		if (this.isAbortLikeError(error)) {
			return this.makeAbortError(item.ctx);
		}

		return new RhinoComputeError(
			error instanceof Error ? error.message : String(error),
			ErrorCodes.UNKNOWN_ERROR,
			{ originalError: error instanceof Error ? error : new Error(String(error)) }
		);
	}

	// --------------------------------------------------------------------------
	// Cancellation
	// --------------------------------------------------------------------------

	/** Cancel everything — in-flight and pending. */
	cancelAll(): void {
		// Reject pending
		if (this.pendingForLatestWins) {
			this.rejectAsAborted(this.pendingForLatestWins);
			this.pendingForLatestWins = null;
		}
		while (this.fifoQueue.length > 0) {
			const item = this.fifoQueue.shift()!;
			this.rejectAsAborted(item);
		}
		// Abort in-flight — their finally blocks will reject their promises
		for (const inflight of this.inFlight) {
			const err = this.makeAbortError(inflight.ctx);
			if (this.settleError(inflight, err)) {
				this.runHook(this.onSettle, inflight.ctx, {
					status: 'error',
					error: err,
					durationMs: inflight.ctx.startedAt ? performance.now() - inflight.ctx.startedAt : 0
				});
			}
			inflight.controller.abort();
		}
		this.notify();
	}

	private rejectAsAborted(item: PendingItem): void {
		this.settleError(item, this.makeAbortError(item.ctx));
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
