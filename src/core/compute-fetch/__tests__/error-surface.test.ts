/**
 * Error-surfacing seam: what the user actually SEES when the Compute8 server
 * fails. The server's exception handler (compute.geometry Startup.cs) emits:
 *
 *   { "error": "Internal Server Error",
 *     "message": "Invalid argument: <detail>",     // the useful part
 *     "stackTrace": [...] }                          // only when Config.Debug
 *
 * The user-facing message must include the server's `message`, not just the
 * generic "Internal Server Error" label. These pin that.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRhinoCompute } from '../compute-fetch';
import { createMockResponse } from '@tests/helpers/mock-fetch';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const config = { serverUrl: 'http://localhost:6500' };

afterEach(() => fetchMock.mockReset());

/** The real Compute8 unhandled-exception body shape. */
function serverException(message: string, withStack = false) {
	return JSON.stringify({
		error: 'Internal Server Error',
		message,
		...(withStack ? { stackTrace: ['at compute.geometry.Foo()', 'at Bar()'] } : {})
	});
}

describe('Compute8 server-exception body is surfaced to the user', () => {
	it('includes the server message, not just "Internal Server Error"', async () => {
		fetchMock.mockResolvedValue(
			createMockResponse(null, {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				body: serverException('Invalid argument: Radius must be positive')
			})
		);

		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toMatchObject({
			code: 'COMPUTATION_ERROR',
			statusCode: 500
		});

		// The actionable detail must reach the user, not just the generic label.
		await expect(fetchRhinoCompute('grasshopper', {}, config)).rejects.toThrow(
			/Radius must be positive/
		);
	});

	it('surfaces a malformed-JSON server error message', async () => {
		fetchMock.mockResolvedValue(
			createMockResponse(null, {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				body: serverException('Malformed JSON received: Unexpected character at line 1')
			})
		);

		try {
			await fetchRhinoCompute('grasshopper', {}, config);
			throw new Error('should have thrown');
		} catch (e) {
			expect((e as Error).message).toContain('Malformed JSON received');
		}
	});
});

describe('Grasshopper partial-success (500 with values) still passes through', () => {
	it('returns the body instead of throwing', async () => {
		const partial = {
			values: [{ ParamName: 'out', InnerTree: {} }],
			errors: ['1. Solution exception: division by zero'],
			warnings: []
		};
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
});
