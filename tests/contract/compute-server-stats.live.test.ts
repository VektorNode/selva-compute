/**
 * LIVE smoke test — drives ComputeServerStats against a real, running compute
 * server and asserts the READ-ONLY probes respond with the right wire shape.
 *
 * This is the test that catches what the mocked unit tests structurally cannot:
 * a route that does not exist on the server (the reason `isServerOnline` was
 * switched off `/healthcheck` onto the proxy root `/`). The unit suite mocks
 * `fetch`, so it would happily pass against a phantom endpoint forever; this one
 * actually hits the wire.
 *
 * Opt-in: self-skips unless COMPUTE_LIVE_URL is set, so the default `vitest run`
 * and CI stay offline and deterministic. Point it at the rhino.compute PROXY
 * (default port 6500), NOT a bare compute.geometry child (6001) — the proxy is
 * where the liveness root `/`, `/idlespan` and `/activechildren` live. `/version`
 * and `/plugins/*\/installed` work on either.
 *
 *   COMPUTE_LIVE_URL=http://localhost:6500 npx vitest run tests/contract/compute-server-stats.live.test.ts
 *
 * Pass COMPUTE_LIVE_KEY if the server has RHINO_COMPUTE_KEY configured.
 *
 * READ-ONLY ONLY: this suite never calls launchChildren/recycleChildren/
 * shutdownChildren — those mutate the child pool. It is safe to run against any
 * reachable server, including production.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import ComputeServerStats from '../../src/core/server/compute-server-stats';

const LIVE_URL = process.env.COMPUTE_LIVE_URL;
const LIVE_KEY = process.env.COMPUTE_LIVE_KEY;

// tests/setup.ts replaces global.fetch with a vi.fn(); restore Node's native
// fetch for this suite so the probes actually reach the network. Captured here
// (not at import time) and put back in afterAll so other suites keep the stub.
let stubbedFetch: typeof globalThis.fetch;

describe.runIf(Boolean(LIVE_URL))('ComputeServerStats — live read-only probes', () => {
	let stats: ComputeServerStats;

	beforeAll(() => {
		// tests/setup.ts stashed Node's native fetch before installing the stub;
		// swap it back for this suite so the probes reach the real network.
		stubbedFetch = globalThis.fetch;
		globalThis.fetch = (globalThis as { __nativeFetch?: typeof fetch }).__nativeFetch!;
		stats = new ComputeServerStats(LIVE_URL!, LIVE_KEY);
	});

	afterAll(async () => {
		await stats.dispose();
		globalThis.fetch = stubbedFetch;
	});

	it('isServerOnline() is true against a running server', async () => {
		await expect(stats.isServerOnline()).resolves.toBe(true);
	});

	it('getVersion() returns a rhino + compute version', async () => {
		const version = await stats.getVersion();
		expect(version).not.toBeNull();
		expect(version!.rhino).toMatch(/\d+\./);
		expect(typeof version!.compute).toBe('string');
	});

	it('getInstalledPlugins() returns a name -> version map', async () => {
		const plugins = await stats.getInstalledPlugins('gh');
		expect(plugins).not.toBeNull();
		// Every value is a version string; the map may legitimately be empty on a
		// vanilla server, so we only assert the shape, not specific plugins.
		for (const v of Object.values(plugins!)) {
			expect(typeof v).toBe('string');
		}
	});

	it('getServerTime() returns a plausible UTC Date', async () => {
		const t = await stats.getServerTime();
		expect(t).toBeInstanceOf(Date);
		// Within a day of the caller's clock — generous, just guards against a
		// parse bug returning epoch-0 or NaN.
		expect(Math.abs(Date.now() - t!.getTime())).toBeLessThan(24 * 60 * 60 * 1000);
	});

	it('getServerStats() aggregates online + version', async () => {
		const all = await stats.getServerStats();
		expect(all.isOnline).toBe(true);
		expect(all.version?.rhino).toMatch(/\d+\./);
	});
});

// Always-present marker so the file isn't reported as empty when skipped.
describe('live stats test wiring', () => {
	it('is opt-in via COMPUTE_LIVE_URL', () => {
		expect(typeof LIVE_URL === 'string' || LIVE_URL === undefined).toBe(true);
	});
});
