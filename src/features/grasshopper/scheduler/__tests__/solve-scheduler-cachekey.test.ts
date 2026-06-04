/**
 * Scheduler-level server-definition-cache reuse.
 *
 * The scheduler learns a definition's server cache key from one solve and uses
 * it (`pointer: cacheKey`) on the next solve of the SAME definition, so a large
 * payload is uploaded once. These pin: first-solve learns the key, second-solve
 * reuses it, a refreshed key is recorded, URL definitions skip the fast path,
 * and the feature is off without a cacheKeyExecutor.
 */
import { describe, it, expect } from 'vitest';

import { SolveScheduler, type SolveExecutor, type CacheKeyExecutor } from '../solve-scheduler';
import type {
	GrasshopperComputeConfig,
	GrasshopperComputeResponse
} from '@/features/grasshopper/types';

const baseConfig: GrasshopperComputeConfig = { serverUrl: 'http://localhost:6500' };

function makeResponse(): GrasshopperComputeResponse {
	return { values: [] } as unknown as GrasshopperComputeResponse;
}

/** A plain executor (full upload) — should not be hit when the fast path is on. */
function plainExecutor(): { executor: SolveExecutor; calls: number } {
	const state = { calls: 0, executor: (() => {}) as unknown as SolveExecutor };
	state.executor = async () => {
		state.calls++;
		return makeResponse();
	};
	return state;
}

/**
 * A cache-key executor that records each (definition, cacheKey) it's called
 * with, and returns a configurable key / miss.
 */
function recordingCacheKeyExecutor(
	behavior: (call: { cacheKey: string | null; n: number }) => {
		cacheKey: string | null;
		missed: boolean;
	}
) {
	const calls: Array<{ definition: string | Uint8Array; cacheKey: string | null }> = [];
	const executor: CacheKeyExecutor = async (definition, _dataTree, cacheKey) => {
		calls.push({ definition, cacheKey });
		const { cacheKey: out, missed } = behavior({ cacheKey, n: calls.length });
		return { response: makeResponse(), cacheKey: out, missed };
	};
	return { executor, calls };
}

describe('scheduler server-definition-cache reuse', () => {
	it('first solve passes null cacheKey, second reuses the learned key', async () => {
		const plain = plainExecutor();
		const ck = recordingCacheKeyExecutor(() => ({ cacheKey: 'md5_LEARNED', missed: false }));
		const s = new SolveScheduler(plain.executor, baseConfig, { mode: 'queue' }, ck.executor);

		await s.solve('big-definition', []);
		await s.solve('big-definition', []);

		expect(ck.calls).toHaveLength(2);
		expect(ck.calls[0].cacheKey).toBeNull(); // first solve: no key yet
		expect(ck.calls[1].cacheKey).toBe('md5_LEARNED'); // second: reuses learned key
		expect(plain.calls).toBe(0); // plain executor never used
		s.dispose();
	});

	it('records a refreshed key after a miss (fallback returns a new key)', async () => {
		const plain = plainExecutor();
		// Call 1 learns md5_A. Call 2 (sent md5_A) misses and the server reassigns md5_B.
		const ck = recordingCacheKeyExecutor(({ n }) =>
			n === 1 ? { cacheKey: 'md5_A', missed: false } : { cacheKey: 'md5_B', missed: true }
		);
		const s = new SolveScheduler(plain.executor, baseConfig, { mode: 'queue' }, ck.executor);

		await s.solve('def', []);
		await s.solve('def', []);
		await s.solve('def', []);

		expect(ck.calls[0].cacheKey).toBeNull();
		expect(ck.calls[1].cacheKey).toBe('md5_A');
		expect(ck.calls[2].cacheKey).toBe('md5_B'); // refreshed key used on 3rd
		s.dispose();
	});

	it('keys are per-definition (different definitions do not share a key)', async () => {
		const plain = plainExecutor();
		const ck = recordingCacheKeyExecutor(({ cacheKey }) => ({
			cacheKey: cacheKey ?? 'md5_FOR_FIRST',
			missed: false
		}));
		const s = new SolveScheduler(plain.executor, baseConfig, { mode: 'queue' }, ck.executor);

		await s.solve('definition-A', []);
		await s.solve('definition-B', []);

		// Both first-solves for their respective definitions → both null.
		expect(ck.calls[0].cacheKey).toBeNull();
		expect(ck.calls[1].cacheKey).toBeNull();
		s.dispose();
	});

	it('skips the fast path for URL-pointer definitions (uses plain executor)', async () => {
		const plain = plainExecutor();
		const ck = recordingCacheKeyExecutor(() => ({ cacheKey: 'md5_X', missed: false }));
		const s = new SolveScheduler(plain.executor, baseConfig, { mode: 'queue' }, ck.executor);

		await s.solve('https://example.com/d.gh', []);

		expect(ck.calls).toHaveLength(0); // URL → not reusable, fast path skipped
		expect(plain.calls).toBe(1);
		s.dispose();
	});

	it('uses the plain executor when no cacheKeyExecutor is supplied', async () => {
		const plain = plainExecutor();
		const s = new SolveScheduler(plain.executor, baseConfig, { mode: 'queue' });

		await s.solve('def', []);
		await s.solve('def', []);

		expect(plain.calls).toBe(2);
		s.dispose();
	});

	it('respects reuseServerDefinitionCache: false (opt-out)', async () => {
		const plain = plainExecutor();
		const ck = recordingCacheKeyExecutor(() => ({ cacheKey: 'md5_X', missed: false }));
		const s = new SolveScheduler(
			plain.executor,
			baseConfig,
			{ mode: 'queue', reuseServerDefinitionCache: false },
			ck.executor
		);

		await s.solve('def', []);

		expect(ck.calls).toHaveLength(0);
		expect(plain.calls).toBe(1);
		s.dispose();
	});
});
