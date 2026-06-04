/**
 * End-to-end tests for GrasshopperClient driven through the stubbed global
 * `fetch` (the production transport seam). These prove the whole path works —
 * client.create() health check, client.solve() → solveGrasshopperDefinition →
 * fetchRhinoCompute → HTTP, and client.getIO() → fetchParsedDefinitionIO → the
 * input-type parser pipeline — without a live Compute server.
 *
 * fetch is routed by URL so each leg (healthcheck / grasshopper / io) is stubbed
 * independently, exercising the real URL building.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import GrasshopperClient from '@/features/grasshopper/client/grasshopper-client';
import { createMockResponse } from '@tests/helpers/mock-fetch';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const SERVER = 'http://localhost:6500';

afterEach(() => {
	fetchMock.mockReset();
});

/** Route fetch by URL suffix; unmatched URLs reject so gaps are loud. */
function route(handlers: Record<string, () => Response>) {
	fetchMock.mockImplementation((url: string) => {
		for (const [suffix, make] of Object.entries(handlers)) {
			if (url.endsWith(suffix)) return Promise.resolve(make());
		}
		return Promise.reject(new Error(`unrouted fetch: ${url}`));
	});
}

const onlineServer = () => createMockResponse({ status: 'healthy' });

describe('GrasshopperClient.create', () => {
	it('resolves when the server healthcheck is OK', async () => {
		route({ '/healthcheck': onlineServer });
		const client = await GrasshopperClient.create({ serverUrl: SERVER });
		expect(client).toBeInstanceOf(GrasshopperClient);
		await client.dispose();
	});

	it('throws NETWORK_ERROR when the server is offline', async () => {
		route({
			'/healthcheck': () => createMockResponse({}, { ok: false, status: 503, statusText: 'down' })
		});
		await expect(GrasshopperClient.create({ serverUrl: SERVER })).rejects.toMatchObject({
			code: 'NETWORK_ERROR'
		});
	});
});

describe('GrasshopperClient.solve (e2e through transport)', () => {
	it('sends the data tree and returns the parsed compute response', async () => {
		const computeResponse = {
			values: [{ ParamName: 'out', InnerTree: {} }],
			errors: [],
			warnings: []
		};
		route({
			'/healthcheck': onlineServer,
			'/grasshopper': () => createMockResponse(computeResponse)
		});

		const client = await GrasshopperClient.create({ serverUrl: SERVER });
		const result = await client.solve('http://example.com/def.gh', [
			{ ParamName: 'radius', InnerTree: { '{0}': [{ type: 'System.Double', data: '5' }] } } as any
		]);

		expect(result).toEqual(computeResponse);

		// The grasshopper request carried our pointer + values.
		const ghCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/grasshopper'))!;
		const body = JSON.parse(ghCall[1].body);
		expect(body.pointer).toBe('http://example.com/def.gh');
		expect(body.values).toHaveLength(1);

		await client.dispose();
	});

	it('rejects an empty definition with INVALID_INPUT before any network call', async () => {
		route({ '/healthcheck': onlineServer });
		const client = await GrasshopperClient.create({ serverUrl: SERVER });

		await expect(client.solve('   ', [])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
		// no /grasshopper call was made
		expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/grasshopper'))).toBe(false);

		await client.dispose();
	});

	it('surfaces a partial-success response (values + errors) as COMPUTATION_ERROR', async () => {
		const partial = {
			values: [{ ParamName: 'out' }],
			errors: ['Solve exception: bad'],
			warnings: []
		};
		route({
			'/healthcheck': onlineServer,
			'/grasshopper': () =>
				createMockResponse(null, {
					ok: false,
					status: 500,
					statusText: 'Internal Server Error',
					body: JSON.stringify(partial)
				})
		});

		const client = await GrasshopperClient.create({ serverUrl: SERVER });
		await expect(client.solve('http://example.com/def.gh', [])).rejects.toMatchObject({
			code: 'COMPUTATION_ERROR'
		});
		await client.dispose();
	});
});

describe('GrasshopperClient.getIO (e2e through transport + parser pipeline)', () => {
	it('fetches IO and parses raw inputs into typed InputParams', async () => {
		// camelCase to match the real Compute8 server contract (pinned by
		// tests/contract/server-contract.test.ts) — fetchDefinitionIO reads these
		// straight through with no key conversion.
		const ioResponse = {
			inputnames: [],
			outputnames: [],
			inputs: [
				{
					name: 'Radius',
					nickname: 'R',
					description: '',
					paramType: 'Number',
					treeAccess: false,
					groupName: null,
					minimum: 0,
					maximum: 10,
					atLeast: 1,
					atMost: 1,
					default: '5'
				}
			],
			outputs: []
		};
		route({
			'/healthcheck': onlineServer,
			'/io': () => createMockResponse(ioResponse)
		});

		const client = await GrasshopperClient.create({ serverUrl: SERVER });
		const io = await client.getIO('http://example.com/def.gh');

		expect(io.inputs).toHaveLength(1);
		const input = io.inputs[0] as any;
		expect(input.paramType).toBe('Number');
		expect(input.name).toBe('Radius');
		// '5' coerced to a number by the numeric parser, through the full pipeline.
		expect(input.default).toBe(5);

		await client.dispose();
	});
});
