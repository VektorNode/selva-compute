/**
 * Seam C — ComputeServerStats against the rhino.compute proxy front.
 *
 * Pins the three stats endpoints' contracts (verified against
 * VektorNode/compute.rhino3d@Compute8) AND the failure-mode behavior, which was
 * previously the least-covered seam:
 *
 *   GET /healthcheck    → 200 (proxy MapHealthChecks). Client only reads .ok.
 *   GET /activechildren → plain-text integer (proxy writes ActiveComputeCount).
 *   GET /version        → { rhino, compute, git_sha } lowercase (proxied to a child).
 *
 * The client must DEGRADE GRACEFULLY on every failure (return null/false, never
 * throw) so a flaky monitor never crashes the caller — these tests pin exactly
 * that, plus that the RhinoComputeKey header is sent when an apiKey is set.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import ComputeServerStats from '../compute-server-stats';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const SERVER = 'http://localhost:6500';

afterEach(() => fetchMock.mockReset());

/** A minimal mock Response with text()/ok/status/headers. */
function res(body: string, init: { ok?: boolean; status?: number } = {}): Response {
	const { ok = true, status = 200 } = init;
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		headers: new Headers(),
		text: async () => body,
		json: async () => JSON.parse(body)
	} as Response;
}

/** Route fetch by URL suffix; unmatched rejects so gaps are loud. */
function route(handlers: Record<string, () => Response>) {
	fetchMock.mockImplementation((url: string) => {
		for (const [suffix, make] of Object.entries(handlers)) {
			if (url.endsWith(suffix)) return Promise.resolve(make());
		}
		return Promise.reject(new Error(`unrouted fetch: ${url}`));
	});
}

describe('isServerOnline', () => {
	it('is true when /healthcheck is 200', async () => {
		route({ '/healthcheck': () => res('Healthy') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.isServerOnline()).resolves.toBe(true);
		await stats.dispose();
	});

	it('is false when /healthcheck is non-2xx', async () => {
		route({ '/healthcheck': () => res('', { ok: false, status: 503 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.isServerOnline()).resolves.toBe(false);
		await stats.dispose();
	});

	it('is false (not throwing) when the network rejects', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.isServerOnline()).resolves.toBe(false);
		await stats.dispose();
	});

	it('hits the /healthcheck endpoint (not a bare URL)', async () => {
		route({ '/healthcheck': () => res('Healthy') });
		const stats = new ComputeServerStats(SERVER);
		await stats.isServerOnline();
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/healthcheck`);
		await stats.dispose();
	});
});

describe('getActiveChildren', () => {
	it('parses the plain-text integer body', async () => {
		route({ '/activechildren': () => res('3') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getActiveChildren()).resolves.toBe(3);
		await stats.dispose();
	});

	it('handles whitespace around the count', async () => {
		route({ '/activechildren': () => res('  5\n') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getActiveChildren()).resolves.toBe(5);
		await stats.dispose();
	});

	it('returns null on a non-numeric body', async () => {
		route({ '/activechildren': () => res('not-a-number') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getActiveChildren()).resolves.toBeNull();
		await stats.dispose();
	});

	it('returns null on a non-2xx response', async () => {
		route({ '/activechildren': () => res('', { ok: false, status: 500 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getActiveChildren()).resolves.toBeNull();
		await stats.dispose();
	});

	it('returns null (not throwing) when the network rejects', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getActiveChildren()).resolves.toBeNull();
		await stats.dispose();
	});
});

describe('getVersion', () => {
	it('reads the lowercase { rhino, compute, git_sha } shape', async () => {
		route({
			'/version': () =>
				res(JSON.stringify({ rhino: '8.0.23304', compute: '1.2.3', git_sha: 'abc123' }))
		});
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getVersion()).resolves.toEqual({
			rhino: '8.0.23304',
			compute: '1.2.3',
			git_sha: 'abc123'
		});
		await stats.dispose();
	});

	it('tolerates a null git_sha (server sends git_sha: null)', async () => {
		route({
			'/version': () => res(JSON.stringify({ rhino: '8.0', compute: '1.0', git_sha: null }))
		});
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getVersion()).resolves.toEqual({
			rhino: '8.0',
			compute: '1.0',
			git_sha: null
		});
		await stats.dispose();
	});

	it('falls back to raw text when the body is not JSON', async () => {
		route({ '/version': () => res('8.0.0-plain') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getVersion()).resolves.toEqual({
			rhino: '8.0.0-plain',
			compute: '',
			git_sha: null
		});
		await stats.dispose();
	});

	it('returns null on a non-2xx response', async () => {
		route({ '/version': () => res('', { ok: false, status: 404 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getVersion()).resolves.toBeNull();
		await stats.dispose();
	});
});

describe('API key header', () => {
	it('sends RhinoComputeKey when an apiKey is configured', async () => {
		route({ '/version': () => res(JSON.stringify({ rhino: '8', compute: '1', git_sha: null })) });
		const stats = new ComputeServerStats(SERVER, 'secret-key');
		await stats.getVersion();
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>)['RhinoComputeKey']).toBe('secret-key');
		await stats.dispose();
	});

	it('omits RhinoComputeKey when no apiKey is set', async () => {
		route({ '/version': () => res(JSON.stringify({ rhino: '8', compute: '1', git_sha: null })) });
		const stats = new ComputeServerStats(SERVER);
		await stats.getVersion();
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>)['RhinoComputeKey']).toBeUndefined();
		await stats.dispose();
	});
});

describe('getServerStats aggregation', () => {
	it('returns only { isOnline: false } when offline (no extra round-trips)', async () => {
		route({ '/healthcheck': () => res('', { ok: false, status: 503 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getServerStats()).resolves.toEqual({ isOnline: false });
		await stats.dispose();
	});

	it('aggregates version + activeChildren when online', async () => {
		route({
			'/healthcheck': () => res('Healthy'),
			'/version': () => res(JSON.stringify({ rhino: '8', compute: '1', git_sha: null })),
			'/activechildren': () => res('2')
		});
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getServerStats()).resolves.toEqual({
			isOnline: true,
			version: { rhino: '8', compute: '1', git_sha: null },
			activeChildren: 2
		});
		await stats.dispose();
	});
});

describe('purgeCache', () => {
	it('returns the purged count from { purged: N }', async () => {
		route({ '/cache/purge': () => res(JSON.stringify({ purged: 17 })) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.purgeCache()).resolves.toBe(17);
		await stats.dispose();
	});

	it('POSTs to /cache/purge', async () => {
		route({ '/cache/purge': () => res(JSON.stringify({ purged: 0 })) });
		const stats = new ComputeServerStats(SERVER);
		await stats.purgeCache();
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/cache/purge`);
		expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
		await stats.dispose();
	});

	it('sends the RhinoComputeKey header when configured', async () => {
		route({ '/cache/purge': () => res(JSON.stringify({ purged: 0 })) });
		const stats = new ComputeServerStats(SERVER, 'k');
		await stats.purgeCache();
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>)['RhinoComputeKey']).toBe('k');
		await stats.dispose();
	});

	it('returns null on a non-2xx response', async () => {
		route({ '/cache/purge': () => res('', { ok: false, status: 401 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.purgeCache()).resolves.toBeNull();
		await stats.dispose();
	});

	it('returns null on a non-JSON / unexpected body', async () => {
		route({ '/cache/purge': () => res('purged') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.purgeCache()).resolves.toBeNull();
		await stats.dispose();
	});

	it('returns null (not throwing) when the network rejects', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.purgeCache()).resolves.toBeNull();
		await stats.dispose();
	});
});

describe('disposal', () => {
	it('throws INVALID_STATE when used after dispose', async () => {
		const stats = new ComputeServerStats(SERVER);
		await stats.dispose();
		await expect(stats.isServerOnline()).rejects.toMatchObject({ code: 'INVALID_STATE' });
	});

	it('is idempotent', async () => {
		const stats = new ComputeServerStats(SERVER);
		await stats.dispose();
		await expect(stats.dispose()).resolves.toBeUndefined();
	});
});
