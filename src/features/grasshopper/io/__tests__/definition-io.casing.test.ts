/**
 * Regression tests for the IO response casing seam.
 *
 * The /io response from the (VektorNode/compute.rhino3d@Compute8) server is
 * already camelCase — pinned by tests/contract/server-contract.test.ts. This
 * file pins the CLIENT side of that seam: `fetchDefinitionIO` must surface the
 * fields the parser reads, and crucially must NOT mangle the keys of a
 * value-list `values` map — those are user-authored Grasshopper dropdown labels
 * (e.g. "Option A", "Small") and have to round-trip verbatim into the UI.
 *
 * Before the fix, fetchDefinitionIO ran camelcaseKeys(response, { deep: true }),
 * which rewrote "Option A" → "optionA" and corrupted the dropdown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDefinitionIO } from '../definition-io';
import { createMockResponse } from '@tests/helpers/mock-fetch';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const CONFIG = { serverUrl: 'http://localhost:6500' };

afterEach(() => fetchMock.mockReset());

/** A realistic camelCase /io response with a value-list input. */
function ioResponse() {
	return {
		description: '',
		filename: '',
		cachekey: 'abc',
		inputnames: ['Size'],
		outputnames: ['Geo'],
		icon: null,
		inputs: [
			{
				id: 'guid-1',
				name: 'Size',
				nickname: 'Size',
				description: 'pick a size',
				paramType: 'ValueList',
				treeAccess: false,
				atLeast: 1,
				atMost: 1,
				groupName: 'Settings::Dimensions',
				values: {
					'Option A': '1',
					'Option B': '2',
					Small: '10',
					'Extra Large': '40'
				}
			}
		],
		outputs: [{ name: 'Geo', nickname: 'Geo', paramType: 'Geometry', id: 'guid-2' }],
		warnings: [],
		errors: []
	};
}

describe('fetchDefinitionIO casing seam', () => {
	it('preserves value-list keys verbatim (does not camelCase dropdown labels)', async () => {
		fetchMock.mockResolvedValue(createMockResponse(ioResponse()));

		const { inputs } = await fetchDefinitionIO('https://example.com/d.gh', CONFIG);
		const values = inputs[0].values!;

		// These are user-facing labels — they MUST survive exactly.
		expect(Object.keys(values)).toEqual(['Option A', 'Option B', 'Small', 'Extra Large']);
		expect(values['Option A']).toBe('1');
		expect(values['Extra Large']).toBe('40');
		// And must NOT have been camelCased.
		expect(values).not.toHaveProperty('optionA');
		expect(values).not.toHaveProperty('extraLarge');
	});

	it('surfaces the camelCase fields the parser reads', async () => {
		fetchMock.mockResolvedValue(createMockResponse(ioResponse()));

		const { inputs, outputs } = await fetchDefinitionIO('https://example.com/d.gh', CONFIG);

		expect(inputs[0]).toMatchObject({
			id: 'guid-1',
			name: 'Size',
			paramType: 'ValueList',
			treeAccess: false,
			groupName: 'Settings::Dimensions'
		});
		expect(outputs[0]).toMatchObject({ name: 'Geo', paramType: 'Geometry', id: 'guid-2' });
	});
});
