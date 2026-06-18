/**
 * Seam C — ComputeServerStats against the rhino.compute proxy front.
 *
 * Pins the three stats endpoints' contracts (verified against
 * VektorNode/compute.rhino3d@Compute8) AND the failure-mode behavior, which was
 * previously the least-covered seam:
 *
 *   GET /                    -> 200 "compute.rhino3d running" (proxy liveness root).
 *   GET /activechildren      -> plain-text integer (proxy writes ActiveComputeCount).
 *   GET /version             -> { rhino, compute, git_sha } lowercase (proxied to a child).
 *   GET /plugins/*\/installed -> { name: version } map of non-core plugins.
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
	it('is true when GET / is 200', async () => {
		fetchMock.mockResolvedValue(res('compute.rhino3d running'));
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.isServerOnline()).resolves.toBe(true);
		await stats.dispose();
	});

	it('is false when GET / is non-2xx', async () => {
		fetchMock.mockResolvedValue(res('', { ok: false, status: 503 }));
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

	it('probes the proxy root `/` (its real liveness route, not /healthcheck)', async () => {
		fetchMock.mockResolvedValue(res('compute.rhino3d running'));
		const stats = new ComputeServerStats(SERVER);
		await stats.isServerOnline();
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/`);
		await stats.dispose();
	});
});

describe('getInstalledPlugins', () => {
	it('returns the gh inventory by default', async () => {
		route({
			'/plugins/gh/installed': () => res(JSON.stringify({ Selva: '1.4.0', Pufferfish: '3.0' }))
		});
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getInstalledPlugins()).resolves.toEqual({
			Selva: '1.4.0',
			Pufferfish: '3.0'
		});
		await stats.dispose();
	});

	it('hits /plugins/rhino/installed when kind is "rhino"', async () => {
		route({ '/plugins/rhino/installed': () => res(JSON.stringify({ Bongo: '8.0' })) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getInstalledPlugins('rhino')).resolves.toEqual({ Bongo: '8.0' });
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/plugins/rhino/installed`);
		await stats.dispose();
	});

	it('returns null on a non-2xx response', async () => {
		route({ '/plugins/gh/installed': () => res('', { ok: false, status: 401 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getInstalledPlugins()).resolves.toBeNull();
		await stats.dispose();
	});

	it('returns null on a non-JSON body', async () => {
		route({ '/plugins/gh/installed': () => res('not json') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getInstalledPlugins()).resolves.toBeNull();
		await stats.dispose();
	});

	it('returns null (not throwing) when the network rejects', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getInstalledPlugins()).resolves.toBeNull();
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

	it('appends ?initialize=false for a passive read (no spawn)', async () => {
		route({ '/activechildren?initialize=false': () => res('2') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getActiveChildren({ initialize: false })).resolves.toBe(2);
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/activechildren?initialize=false`);
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
		route({ '/': () => res('', { ok: false, status: 503 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getServerStats()).resolves.toEqual({ isOnline: false });
		await stats.dispose();
	});

	it('aggregates version + activeChildren when online', async () => {
		route({
			'/version': () => res(JSON.stringify({ rhino: '8', compute: '1', git_sha: null })),
			// getServerStats reads the child count passively (no spawn).
			'/activechildren?initialize=false': () => res('2'),
			'/': () => res('compute.rhino3d running')
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

describe('purgeAllChildren', () => {
	it('reads the passive child count and fires 2× purges', async () => {
		let purges = 0;
		route({
			'/activechildren?initialize=false': () => res('3'),
			'/cache/purge': () => {
				purges++;
				return res(JSON.stringify({ purged: 5 }));
			}
		});
		const stats = new ComputeServerStats(SERVER);
		const result = await stats.purgeAllChildren();
		expect(result).toEqual({ totalPurged: 30, calls: 6, children: 3, confident: false });
		expect(purges).toBe(6); // 2 × 3
		// The count probe must be the non-spawning variant.
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/activechildren?initialize=false`);
		await stats.dispose();
	});

	it('is confident at a single-child pool (one purge is exact)', async () => {
		route({
			'/activechildren?initialize=false': () => res('1'),
			'/cache/purge': () => res(JSON.stringify({ purged: 7 }))
		});
		const stats = new ComputeServerStats(SERVER);
		const result = await stats.purgeAllChildren();
		expect(result).toEqual({ totalPurged: 14, calls: 2, children: 1, confident: true });
		await stats.dispose();
	});

	it('short-circuits with zero work when no children are live', async () => {
		let purges = 0;
		route({
			'/activechildren?initialize=false': () => res('0'),
			'/cache/purge': () => {
				purges++;
				return res(JSON.stringify({ purged: 1 }));
			}
		});
		const stats = new ComputeServerStats(SERVER);
		const result = await stats.purgeAllChildren();
		expect(result).toEqual({ totalPurged: 0, calls: 0, children: 0, confident: true });
		expect(purges).toBe(0);
		await stats.dispose();
	});

	it('returns null when the child count is unreadable', async () => {
		route({ '/activechildren?initialize=false': () => res('', { ok: false, status: 503 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.purgeAllChildren()).resolves.toBeNull();
		await stats.dispose();
	});

	it('tolerates a failed purge mid-loop (skips it, keeps going)', async () => {
		let n = 0;
		route({
			'/activechildren?initialize=false': () => res('2'),
			'/cache/purge': () => {
				n++;
				// Second of the four calls fails; the rest return 4 each.
				return n === 2 ? res('', { ok: false, status: 500 }) : res(JSON.stringify({ purged: 4 }));
			}
		});
		const stats = new ComputeServerStats(SERVER);
		const result = await stats.purgeAllChildren();
		// 4 calls, one failed -> 3 × 4 purged.
		expect(result).toEqual({ totalPurged: 12, calls: 4, children: 2, confident: false });
		await stats.dispose();
	});
});

describe('getServerTime', () => {
	it('parses the JSON-quoted ISO timestamp into a Date', async () => {
		route({ '/servertime': () => res('"2026-06-18T08:30:00Z"') });
		const stats = new ComputeServerStats(SERVER);
		const t = await stats.getServerTime();
		expect(t?.toISOString()).toBe('2026-06-18T08:30:00.000Z');
		await stats.dispose();
	});

	it('returns null on an unparseable body', async () => {
		route({ '/servertime': () => res('"not-a-date"') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getServerTime()).resolves.toBeNull();
		await stats.dispose();
	});
});

describe('getIdleSpan', () => {
	it('parses the numeric idle seconds', async () => {
		route({ '/idlespan': () => res('42.5') });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getIdleSpan()).resolves.toBe(42.5);
		await stats.dispose();
	});

	it('returns null on a non-2xx response', async () => {
		route({ '/idlespan': () => res('', { ok: false, status: 500 }) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.getIdleSpan()).resolves.toBeNull();
		await stats.dispose();
	});
});

describe('child-lifecycle control', () => {
	it('launchChildren POSTs and returns { spawned, active }', async () => {
		route({ '/launch-children': () => res(JSON.stringify({ spawned: [6001, 6002], active: 2 })) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.launchChildren()).resolves.toEqual({ spawned: [6001, 6002], active: 2 });
		expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
		await stats.dispose();
	});

	it('launchChild appends ?port=N when a port is given', async () => {
		route({ '/launch-child?port=6003': () => res(JSON.stringify({ spawned: [6003] })) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.launchChild(6003)).resolves.toEqual({ spawned: [6003] });
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/launch-child?port=6003`);
		await stats.dispose();
	});

	it('shutdownChildren targets all children when no port is given', async () => {
		route({ '/shutdown-children': () => res(JSON.stringify({ shutdown: 3, active: 0 })) });
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.shutdownChildren()).resolves.toEqual({ shutdown: 3, active: 0 });
		expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/shutdown-children`);
		await stats.dispose();
	});

	it('recycleChildren returns { shutdown, spawned, active }', async () => {
		route({
			'/recycle-children': () =>
				res(JSON.stringify({ shutdown: 2, spawned: [6001, 6002], active: 2 }))
		});
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.recycleChildren()).resolves.toEqual({
			shutdown: 2,
			spawned: [6001, 6002],
			active: 2
		});
		await stats.dispose();
	});

	it('returns null (not throwing) when a control call rejects', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		const stats = new ComputeServerStats(SERVER);
		await expect(stats.recycleChildren()).resolves.toBeNull();
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
