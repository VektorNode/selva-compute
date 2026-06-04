/**
 * Contract tests for the Rhino Compute transport (`fetchRhinoCompute`).
 *
 * The transport is the deepest module in the library — retry/backoff, the
 * HTTP-status → error-code mapping table, the timeout-vs-caller-abort
 * distinction, partial-success 500 handling, and JSON-parse failure all live
 * here. These tests drive it through the global `fetch` (stubbed in
 * tests/setup.ts), which is the same seam the library uses in production.
 *
 * Time is controlled with fake timers so backoff sleeps resolve instantly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRhinoCompute } from '@/core/compute-fetch/compute-fetch';
import { createMockResponse } from '@tests/helpers/mock-fetch';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const config = { serverUrl: 'http://localhost:6500' };

afterEach(() => {
	fetchMock.mockReset();
});

describe('fetchRhinoCompute — request shape', () => {
	it('POSTs to <serverUrl>/<endpoint> with JSON body and request id header', async () => {
		fetchMock.mockResolvedValueOnce(createMockResponse({ ok: true }));

		await fetchRhinoCompute('grasshopper', { values: [1, 2] }, config);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:6500/grasshopper');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ values: [1, 2] });
		expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
		expect((init.headers as Record<string, string>)['X-Request-ID']).toBeTruthy();
	});

	it('sends the API key as the RhinoComputeKey header when configured', async () => {
		fetchMock.mockResolvedValueOnce(createMockResponse({ ok: true }));

		await fetchRhinoCompute('io', {}, { ...config, apiKey: 'secret' });

		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers.RhinoComputeKey).toBe('secret');
	});

	it('sends the auth token as the Authorization header when configured', async () => {
		fetchMock.mockResolvedValueOnce(createMockResponse({ ok: true }));

		await fetchRhinoCompute('io', {}, { ...config, authToken: 'Bearer xyz' });

		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer xyz');
	});

	it('returns the parsed JSON response', async () => {
		fetchMock.mockResolvedValueOnce(createMockResponse({ values: [], extra: 7 }));
		const res = await fetchRhinoCompute('grasshopper', {}, config);
		expect(res).toEqual({ values: [], extra: 7 });
	});
});

describe('fetchRhinoCompute — HTTP status → error code mapping', () => {
	const cases: Array<[number, string, string]> = [
		[401, 'Unauthorized', 'AUTH_ERROR'],
		[403, 'Forbidden', 'AUTH_ERROR'],
		[404, 'Not Found', 'NETWORK_ERROR'],
		[413, 'Payload Too Large', 'VALIDATION_ERROR'],
		[500, 'Internal Server Error', 'COMPUTATION_ERROR']
	];

	it.each(cases)('maps HTTP %i (%s) to %s', async (status, statusText, code) => {
		fetchMock.mockResolvedValueOnce(
			createMockResponse({ msg: 'fail' }, { ok: false, status, statusText })
		);

		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toMatchObject({
			code,
			statusCode: status
		});
	});

	it('maps an unmapped status (418) to UNKNOWN_ERROR', async () => {
		fetchMock.mockResolvedValueOnce(
			createMockResponse({}, { ok: false, status: 418, statusText: "I'm a teapot" })
		);
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toMatchObject({
			code: 'UNKNOWN_ERROR',
			statusCode: 418
		});
	});

	it('includes a body excerpt in the error message', async () => {
		fetchMock.mockResolvedValueOnce(
			createMockResponse(null, {
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				body: 'invalid api key'
			})
		);
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toThrow(/invalid api key/);
	});
});

describe('fetchRhinoCompute — partial success (HTTP 500 with values)', () => {
	it('returns the body instead of throwing when a 500 carries values + errors', async () => {
		const partial = { values: [{ ParamName: 'out' }], errors: ['boom'], warnings: [] };
		fetchMock.mockResolvedValueOnce(
			createMockResponse(null, {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				body: JSON.stringify(partial)
			})
		);

		const res = await fetchRhinoCompute('grasshopper', {}, config);
		expect(res).toEqual(partial);
	});

	it('still throws COMPUTATION_ERROR for a 500 with no values', async () => {
		// Real Compute8 exception shape: { error, message, stackTrace? }. The
		// detailed `message` must surface to the caller (regression-pinned in
		// error-surface.test.ts), not be swallowed by the generic "error" label.
		fetchMock.mockResolvedValue(
			createMockResponse(null, {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				body: JSON.stringify({
					error: 'Internal Server Error',
					message: 'Invalid argument: bad input'
				})
			})
		);
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toMatchObject({
			code: 'COMPUTATION_ERROR',
			statusCode: 500
		});
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toThrow(
			/Invalid argument: bad input/
		);
	});
});

describe('fetchRhinoCompute — malformed responses', () => {
	it('throws NETWORK_ERROR when a 200 body is not valid JSON', async () => {
		fetchMock.mockResolvedValueOnce(
			createMockResponse(null, { ok: true, status: 200, body: 'not json {' })
		);
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toMatchObject({
			code: 'NETWORK_ERROR'
		});
	});

	it('wraps a network-layer TypeError as NETWORK_ERROR', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toMatchObject({
			code: 'NETWORK_ERROR'
		});
	});
});

describe('fetchRhinoCompute — retry', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const retryCfg = { ...config, retry: { attempts: 2, baseDelayMs: 100, maxDelayMs: 100 } };

	it('retries a retryable 503 and resolves on a later success', async () => {
		fetchMock
			.mockResolvedValueOnce(createMockResponse({}, { ok: false, status: 503, statusText: 'down' }))
			.mockResolvedValueOnce(createMockResponse({ ok: 'recovered' }));

		const promise = fetchRhinoCompute('grasshopper', {}, retryCfg);
		await vi.advanceTimersByTimeAsync(200);

		await expect(promise).resolves.toEqual({ ok: 'recovered' });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('throws after retries are exhausted, surfacing the last error', async () => {
		fetchMock.mockResolvedValue(
			createMockResponse({}, { ok: false, status: 502, statusText: 'bad gateway' })
		);

		const promise = fetchRhinoCompute('grasshopper', {}, retryCfg);
		const assertion = expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
		await vi.advanceTimersByTimeAsync(1000);
		await assertion;

		// 1 initial + 2 retries = 3 attempts
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('does NOT retry a non-retryable status (401)', async () => {
		fetchMock.mockResolvedValue(
			createMockResponse({}, { ok: false, status: 401, statusText: 'Unauthorized' })
		);
		await expect(fetchRhinoCompute('grasshopper', {}, retryCfg)).rejects.toMatchObject({
			code: 'AUTH_ERROR'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('honors a Retry-After header on a retried 429', async () => {
		fetchMock
			.mockResolvedValueOnce(
				createMockResponse(
					{},
					{
						ok: false,
						status: 429,
						statusText: 'Too Many Requests',
						headers: { 'Retry-After': '5' }
					}
				)
			)
			.mockResolvedValueOnce(createMockResponse({ ok: 'after-wait' }));

		const promise = fetchRhinoCompute('grasshopper', {}, retryCfg);

		// Retry-After: 5s. Advancing less than that should NOT yet fire the retry.
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5000);
		await expect(promise).resolves.toEqual({ ok: 'after-wait' });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry 429 when retryOn429 is false', async () => {
		fetchMock.mockResolvedValue(
			createMockResponse({}, { ok: false, status: 429, statusText: 'Too Many Requests' })
		);
		const promise = fetchRhinoCompute(
			'grasshopper',
			{},
			{
				...config,
				retry: { attempts: 2, baseDelayMs: 100, maxDelayMs: 100, retryOn429: false }
			}
		);
		await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR', statusCode: 429 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('fetchRhinoCompute — abort and timeout', () => {
	it('a caller-aborted request rejects and is never retried', async () => {
		const controller = new AbortController();
		controller.abort();

		fetchMock.mockImplementation((_url, init) => {
			if ((init as RequestInit).signal?.aborted) {
				return Promise.reject(new DOMException('Aborted', 'AbortError'));
			}
			return Promise.resolve(createMockResponse({ ok: true }));
		});

		await expect(
			fetchRhinoCompute(
				'grasshopper',
				{},
				{
					...config,
					signal: controller.signal,
					retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
				}
			)
		).rejects.toThrow(/aborted by caller/i);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('a timeout is retryable and reported as TIMEOUT_ERROR when exhausted', async () => {
		vi.useFakeTimers();
		try {
			// fetch rejects with a non-caller TimeoutError each attempt.
			fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

			const promise = fetchRhinoCompute(
				'grasshopper',
				{},
				{
					...config,
					timeoutMs: 1000,
					retry: { attempts: 1, baseDelayMs: 100, maxDelayMs: 100 }
				}
			);
			const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
			await vi.advanceTimersByTimeAsync(500);
			await assertion;
			// 1 initial + 1 retry
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});
});
