import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { composeSignal } from '../compute-fetch';

/**
 * Listener-leak audit for `composeSignal` (#22 in IMPROVEMENTS.md).
 *
 * The fast paths use `AbortSignal.any` / `AbortSignal.timeout`, which manage
 * their own listeners. The manual-fallback path (older runtimes) attaches
 * listeners to caller signals — this test forces that path and verifies that
 * `cleanup()` removes every listener it added, even across many calls.
 */

describe('composeSignal — listener cleanup', () => {
	const realAny = (AbortSignal as any).any;
	const realTimeout = AbortSignal.timeout;

	beforeEach(() => {
		// Force the manual fallback path
		(AbortSignal as any).any = undefined;
		(AbortSignal as any).timeout = undefined;
	});

	afterEach(() => {
		(AbortSignal as any).any = realAny;
		(AbortSignal as any).timeout = realTimeout;
	});

	it('removes every listener it adds, across many calls (manual-fallback path)', () => {
		const callerCtrl = new AbortController();
		const callerSignal = callerCtrl.signal;

		const addSpy = vi.spyOn(callerSignal, 'addEventListener');
		const removeSpy = vi.spyOn(callerSignal, 'removeEventListener');

		for (let i = 0; i < 50; i++) {
			const { cleanup } = composeSignal(callerSignal, 5000);
			cleanup();
		}

		// Each call must add and remove the same number of 'abort' listeners
		const adds = addSpy.mock.calls.filter(([type]) => type === 'abort').length;
		const removes = removeSpy.mock.calls.filter(([type]) => type === 'abort').length;

		expect(adds).toBe(removes);
		expect(adds).toBeGreaterThan(0); // Sanity check the fallback path ran
	});

	it('cleanup is idempotent and removes the timer from the timeout fallback', () => {
		vi.useFakeTimers();
		try {
			const { cleanup } = composeSignal(undefined, 1000);
			expect(vi.getTimerCount()).toBe(1);
			cleanup();
			expect(vi.getTimerCount()).toBe(0);
			// Calling cleanup twice must not throw
			expect(() => cleanup()).not.toThrow();
		} finally {
			vi.useRealTimers();
		}
	});

	it('returns undefined signal when no caller signal and no timeout', () => {
		const { signal, cleanup } = composeSignal(undefined, undefined);
		expect(signal).toBeUndefined();
		expect(() => cleanup()).not.toThrow();
	});

	it('does not leak listeners when an input signal is already aborted', () => {
		const ctrl = new AbortController();
		ctrl.abort();
		const removeSpy = vi.spyOn(ctrl.signal, 'removeEventListener');
		const addSpy = vi.spyOn(ctrl.signal, 'addEventListener');

		const { signal, cleanup } = composeSignal(ctrl.signal, 5000);
		expect(signal?.aborted).toBe(true);
		cleanup();

		const adds = addSpy.mock.calls.filter(([t]) => t === 'abort').length;
		const removes = removeSpy.mock.calls.filter(([t]) => t === 'abort').length;
		// Whatever was added must be removed.
		expect(removes).toBeGreaterThanOrEqual(adds);
	});
});
