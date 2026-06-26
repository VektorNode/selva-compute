/**
 * Server-definition-cache reuse at the solve-primitive layer.
 *
 * Large (base64/binary) definitions can be uploaded once and then solved by
 * reference (`pointer: cacheKey`) instead of re-sending the full payload — the
 * server returns its `md5_…` cache key as `pointer` on the solve response, and
 * `GrasshopperDefinition.FromUrl` resolves a cache key as a pointer.
 *
 * These pin: capturing the key, solving by key, and the transparent fallback to
 * a full upload when the key has been evicted ("Unable to load grasshopper
 * definition").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	solveByCacheKey,
	solveGrasshopperDefinitionWithCacheKey,
	solveGrasshopperDefinition
} from '../solve';
import { createMockResponse } from '@tests/helpers/mock-fetch';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const config = { serverUrl: 'http://localhost:6500' };
const DEF = 'definition-content'; // plain string → uploaded as base64 algo

afterEach(() => fetchMock.mockReset());

/** Parse the request body of the Nth fetch call. */
function body(call = 0) {
	return JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
}

const okSolve = (over: Record<string, unknown> = {}) =>
	createMockResponse({ values: [], pointer: 'md5_ABC', ...over });

const loadFailed = () =>
	createMockResponse(
		{
			error: 'Internal Server Error',
			message: 'Invalid argument: Unable to load grasshopper definition'
		},
		{ ok: false, status: 500, statusText: 'Internal Server Error' }
	);

// Production-mode server: the human message is scrubbed to a generic string, but
// a stable machine `code` identifies the miss. This is the path that matters once
// the fork ships the code (debug-off deployments) — the string match above can't
// catch it.
const loadFailedScrubbed = () =>
	createMockResponse(
		{
			error: 'Internal Server Error',
			message: 'An unexpected error occurred. Check server logs for details.',
			code: 'definition_not_cached'
		},
		{ ok: false, status: 500, statusText: 'Internal Server Error' }
	);

describe('solveGrasshopperDefinitionWithCacheKey', () => {
	it('captures the server cache key from the response pointer', async () => {
		fetchMock.mockResolvedValueOnce(okSolve({ pointer: 'md5_DEADBEEF' }));

		const { response, cacheKey } = await solveGrasshopperDefinitionWithCacheKey([], DEF, config);

		expect(cacheKey).toBe('md5_DEADBEEF');
		// The captured pointer is stripped from the returned response.
		expect(response).not.toHaveProperty('pointer');
		// First solve uploads the full base64 algo.
		expect(body().algo).toBeTruthy();
		expect(body().pointer).toBeNull();
	});

	it('reports null cacheKey when the server returns no pointer', async () => {
		fetchMock.mockResolvedValueOnce(createMockResponse({ values: [] }));
		const { cacheKey } = await solveGrasshopperDefinitionWithCacheKey([], DEF, config);
		expect(cacheKey).toBeNull();
	});
});

describe('solveByCacheKey — fast path', () => {
	it('solves by pointer and does NOT upload the base64', async () => {
		fetchMock.mockResolvedValueOnce(okSolve({ pointer: 'md5_ABC' }));

		const { missed, cacheKey } = await solveByCacheKey([], 'md5_ABC', DEF, config);

		expect(missed).toBe(false);
		expect(cacheKey).toBe('md5_ABC');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		// Sent the pointer, not the algo — this is the whole point (no re-upload).
		expect(body().pointer).toBe('md5_ABC');
		expect(body().algo).toBeNull();
	});
});

describe('solveByCacheKey — fallback on cache miss', () => {
	it('retries with the full upload when the key was evicted', async () => {
		fetchMock
			.mockResolvedValueOnce(loadFailed()) // pointer solve misses
			.mockResolvedValueOnce(okSolve({ pointer: 'md5_NEW' })); // full upload succeeds

		const { response, cacheKey, missed } = await solveByCacheKey([], 'md5_OLD', DEF, config);

		expect(missed).toBe(true);
		expect(cacheKey).toBe('md5_NEW'); // fresh key captured
		expect(response.values).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// 1st: pointer attempt. 2nd: full algo upload.
		expect(body(0).pointer).toBe('md5_OLD');
		expect(body(0).algo).toBeNull();
		expect(body(1).algo).toBeTruthy();
		expect(body(1).pointer).toBeNull();
	});

	it('falls back when the miss is signalled by code, not message (prod server)', async () => {
		fetchMock
			.mockResolvedValueOnce(loadFailedScrubbed()) // pointer solve misses, message scrubbed
			.mockResolvedValueOnce(okSolve({ pointer: 'md5_NEW' })); // full upload succeeds

		const { cacheKey, missed } = await solveByCacheKey([], 'md5_OLD', DEF, config);

		expect(missed).toBe(true);
		expect(cacheKey).toBe('md5_NEW');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(body(1).algo).toBeTruthy();
	});

	it('does NOT fall back on an unrelated error', async () => {
		fetchMock.mockResolvedValueOnce(
			createMockResponse(
				{ error: 'Internal Server Error', message: 'Invalid argument: bad input' },
				{ ok: false, status: 500, statusText: 'Internal Server Error' }
			)
		);

		await expect(solveByCacheKey([], 'md5_X', DEF, config)).rejects.toThrow(/bad input/);
		// Only the pointer attempt — no full-upload retry for a non-miss error.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('solveGrasshopperDefinition still strips pointer (unchanged public shape)', () => {
	it('returns a response without the pointer field', async () => {
		fetchMock.mockResolvedValueOnce(okSolve({ pointer: 'md5_ABC' }));
		const res = await solveGrasshopperDefinition([], DEF, config);
		expect(res).not.toHaveProperty('pointer');
	});
});
