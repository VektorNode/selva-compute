import { describe, it, expect, vi } from 'vitest';
import { SolveScheduler, type SolveExecutor } from '../solve-scheduler';
import { RhinoComputeError, ErrorCodes } from '@/core/errors';
import type {
	GrasshopperComputeConfig,
	GrasshopperComputeResponse
} from '@/features/grasshopper/types';

const baseConfig: GrasshopperComputeConfig = {
	serverUrl: 'http://localhost:6500'
};

function makeResponse(tag: string): GrasshopperComputeResponse {
	return {
		algo: 'x',
		filename: tag,
		dataversion: 8,
		modelunits: 'Meters',
		cachesolve: false,
		values: []
	} as unknown as GrasshopperComputeResponse;
}

/**
 * Build an executor that resolves on demand. Returns the executor plus a
 * controller for releasing pending calls in test order.
 */
function deferredExecutor() {
	const queue: Array<{
		definition: string | Uint8Array;
		dataTree: any[];
		signal: AbortSignal | undefined;
		release: (response: GrasshopperComputeResponse) => void;
		fail: (error: Error) => void;
	}> = [];

	const executor: SolveExecutor = (definition, dataTree, config) => {
		return new Promise((resolve, reject) => {
			const signal = config.signal;
			const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
			signal?.addEventListener('abort', onAbort, { once: true });

			queue.push({
				definition,
				dataTree,
				signal,
				release: (r) => {
					signal?.removeEventListener('abort', onAbort);
					resolve(r);
				},
				fail: (e) => {
					signal?.removeEventListener('abort', onAbort);
					reject(e);
				}
			});
		});
	};

	return { executor, queue };
}

describe('SolveScheduler', () => {
	describe('latest-wins mode', () => {
		it('runs a single solve to completion', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, { mode: 'latest-wins' });

			const promise = scheduler.solve('def', []);
			expect(scheduler.isSolving).toBe(true);
			expect(queue).toHaveLength(1);

			queue[0].release(makeResponse('a'));
			const result = await promise;
			expect(result.filename).toBe('a');
			expect(scheduler.isSolving).toBe(false);
			expect(scheduler.lastResult?.filename).toBe('a');
		});

		it('aborts in-flight when a new solve arrives', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, { mode: 'latest-wins' });

			const first = scheduler.solve('def', [{ ParamName: 'x', InnerTree: {} } as any]);
			expect(queue).toHaveLength(1);

			const second = scheduler.solve('def', [{ ParamName: 'y', InnerTree: {} } as any]);

			// First should reject as superseded; the in-flight is aborted via its signal
			await expect(first).rejects.toMatchObject({ message: expect.stringMatching(/Superseded/i) });

			// The aborted call rejects with AbortError → drainNext kicks in → second runs
			await vi.waitFor(() => expect(queue.length).toBeGreaterThanOrEqual(2));

			queue[1].release(makeResponse('b'));
			const r2 = await second;
			expect(r2.filename).toBe('b');
		});

		it('supersedes pending when newer call arrives during in-flight', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, { mode: 'latest-wins' });

			const first = scheduler.solve('def', [{ ParamName: 'x', InnerTree: {} } as any]);
			const middle = scheduler.solve('def', [{ ParamName: 'y', InnerTree: {} } as any]);
			const last = scheduler.solve('def', [{ ParamName: 'z', InnerTree: {} } as any]);

			// Both first (in-flight, aborted) and middle (pending, superseded) reject
			await expect(first).rejects.toMatchObject({ code: expect.any(String) });
			await expect(middle).rejects.toMatchObject({ message: expect.stringMatching(/Superseded/i) });

			// `last` should run after the aborted first finishes its finally block
			await vi.waitFor(() => expect(queue.length).toBe(2));
			queue[1].release(makeResponse('z'));
			await expect(last).resolves.toMatchObject({ filename: 'z' });
		});

		it('fires onSuperseded hook for cancelled calls', async () => {
			const { executor } = deferredExecutor();
			const onSuperseded = vi.fn();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'latest-wins',
				onSuperseded
			});

			scheduler.solve('def', [{ ParamName: 'x', InnerTree: {} } as any]).catch(() => {});
			scheduler.solve('def', [{ ParamName: 'y', InnerTree: {} } as any]).catch(() => {});

			expect(onSuperseded).toHaveBeenCalledTimes(1);
		});
	});

	describe('queue mode', () => {
		it('runs solves serially when maxConcurrent=1', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				maxConcurrent: 1
			});

			const a = scheduler.solve('def', [{ ParamName: 'a', InnerTree: {} } as any]);
			const b = scheduler.solve('def', [{ ParamName: 'b', InnerTree: {} } as any]);

			// Only first should be in-flight
			expect(queue).toHaveLength(1);
			expect(scheduler.queueDepth).toBe(1);

			queue[0].release(makeResponse('a'));
			await a;

			await vi.waitFor(() => expect(queue.length).toBe(2));
			queue[1].release(makeResponse('b'));
			expect((await b).filename).toBe('b');
		});

		it('respects maxConcurrent', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				maxConcurrent: 2
			});

			scheduler.solve('def', [{ ParamName: 'a', InnerTree: {} } as any]).catch(() => {});
			scheduler.solve('def', [{ ParamName: 'b', InnerTree: {} } as any]).catch(() => {});
			scheduler.solve('def', [{ ParamName: 'c', InnerTree: {} } as any]).catch(() => {});

			expect(queue).toHaveLength(2);
			expect(scheduler.inFlightCount).toBe(2);
			expect(scheduler.queueDepth).toBe(1);
		});
	});

	describe('cancellation', () => {
		it('cancelAll rejects pending and aborts in-flight', async () => {
			const { executor } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				maxConcurrent: 1
			});

			const a = scheduler.solve('def', [{ ParamName: 'a', InnerTree: {} } as any]);
			const b = scheduler.solve('def', [{ ParamName: 'b', InnerTree: {} } as any]);

			scheduler.cancelAll();

			await expect(a).rejects.toBeInstanceOf(RhinoComputeError);
			await expect(b).rejects.toMatchObject({ message: expect.stringMatching(/aborted/i) });
		});

		it('per-call signal aborts only that call', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				maxConcurrent: 2
			});

			const ctrlA = new AbortController();
			const a = scheduler.solve('def', [{ ParamName: 'a', InnerTree: {} } as any], {
				signal: ctrlA.signal
			});
			const b = scheduler.solve('def', [{ ParamName: 'b', InnerTree: {} } as any]);

			ctrlA.abort();
			await expect(a).rejects.toBeInstanceOf(RhinoComputeError);

			// b should still be in flight
			expect(scheduler.inFlightCount).toBe(1);
			queue[1].release(makeResponse('b'));
			await expect(b).resolves.toMatchObject({ filename: 'b' });
		});

		it('rejects immediately when caller signal is already aborted', async () => {
			const { executor } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig);
			const ctrl = new AbortController();
			ctrl.abort();
			await expect(
				scheduler.solve('def', [], { signal: ctrl.signal })
			).rejects.toMatchObject({ code: ErrorCodes.UNKNOWN_ERROR });
		});
	});

	describe('cache', () => {
		it('returns cached response without invoking executor', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				cache: true
			});

			const tree = [{ ParamName: 'x', InnerTree: {} } as any];
			const first = scheduler.solve('def', tree);
			queue[0].release(makeResponse('hit'));
			await first;

			// Same input → cache hit
			const second = await scheduler.solve('def', tree);
			expect(second.filename).toBe('hit');
			expect(queue).toHaveLength(1); // executor not called again
		});

		it('respects ttl', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				cache: { ttlMs: 10 }
			});

			const tree = [{ ParamName: 'x', InnerTree: {} } as any];
			const first = scheduler.solve('def', tree);
			queue[0].release(makeResponse('one'));
			await first;

			await new Promise((r) => setTimeout(r, 20));

			const secondPromise = scheduler.solve('def', tree);
			await vi.waitFor(() => expect(queue.length).toBe(2));
			queue[1].release(makeResponse('two'));
			const second = await secondPromise;
			expect(second.filename).toBe('two');
		});

		it('evicts oldest when over maxEntries', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				cache: { maxEntries: 2 }
			});

			// Three different inputs
			const trees = ['a', 'b', 'c'].map((n) => [{ ParamName: n, InnerTree: {} } as any]);

			const p1 = scheduler.solve('def', trees[0]);
			queue[0].release(makeResponse('1'));
			await p1;

			const p2 = scheduler.solve('def', trees[1]);
			await vi.waitFor(() => expect(queue.length).toBe(2));
			queue[1].release(makeResponse('2'));
			await p2;

			const p3 = scheduler.solve('def', trees[2]);
			await vi.waitFor(() => expect(queue.length).toBe(3));
			queue[2].release(makeResponse('3'));
			await p3;

			// First entry should have been evicted
			const recheck = scheduler.solve('def', trees[0]);
			await vi.waitFor(() => expect(queue.length).toBe(4));
			queue[3].release(makeResponse('1-again'));
			expect((await recheck).filename).toBe('1-again');
		});
	});

	describe('observability', () => {
		it('notifies subscribers on state change', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig);
			const listener = vi.fn();
			scheduler.subscribe(listener);

			const p = scheduler.solve('def', []);
			expect(listener).toHaveBeenCalled();

			queue[0].release(makeResponse('x'));
			await p;

			// Settle should also notify
			expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
		});

		it('exposes lastResult / lastError / lastDurationMs', async () => {
			const { executor, queue } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig);

			const p1 = scheduler.solve('def', []);
			queue[0].release(makeResponse('ok'));
			await p1;

			expect(scheduler.lastResult?.filename).toBe('ok');
			expect(scheduler.lastDurationMs).toBeGreaterThanOrEqual(0);
			expect(scheduler.lastError).toBeNull();

			const p2 = scheduler.solve('def', [{ ParamName: 'fail', InnerTree: {} } as any]);
			queue[1].fail(new Error('boom'));
			await expect(p2).rejects.toBeInstanceOf(RhinoComputeError);
			expect(scheduler.lastError).toBeInstanceOf(RhinoComputeError);
		});

		it('fires onStart and onSettle hooks', async () => {
			const { executor, queue } = deferredExecutor();
			const onStart = vi.fn();
			const onSettle = vi.fn();
			const scheduler = new SolveScheduler(executor, baseConfig, { onStart, onSettle });

			const p = scheduler.solve('def', []);
			expect(onStart).toHaveBeenCalledTimes(1);

			queue[0].release(makeResponse('x'));
			await p;

			expect(onSettle).toHaveBeenCalledTimes(1);
			expect(onSettle.mock.calls[0][1]).toMatchObject({ status: 'success', fromCache: false });
		});
	});

	describe('dispose', () => {
		it('cancels everything and rejects new calls', async () => {
			const { executor } = deferredExecutor();
			const scheduler = new SolveScheduler(executor, baseConfig, {
				mode: 'queue',
				maxConcurrent: 1
			});

			const a = scheduler.solve('def', [{ ParamName: 'a', InnerTree: {} } as any]);
			const b = scheduler.solve('def', [{ ParamName: 'b', InnerTree: {} } as any]);

			scheduler.dispose();

			await expect(a).rejects.toBeInstanceOf(RhinoComputeError);
			await expect(b).rejects.toBeInstanceOf(RhinoComputeError);

			await expect(scheduler.solve('def', [])).rejects.toMatchObject({
				code: ErrorCodes.INVALID_STATE
			});
		});
	});
});
