/**
 * Server-Timing seam: the solve endpoint emits a per-request timing breakdown
 * (`decode;dur=N, solve;dur=N, encode;dur=N`) on every response. These pin the
 * parser and the onServerTiming callback wiring.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRhinoCompute, parseServerTiming } from '../compute-fetch';
import { createMockResponse } from '@tests/helpers/mock-fetch';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
const config = { serverUrl: 'http://localhost:6500' };

afterEach(() => fetchMock.mockReset());

describe('parseServerTiming', () => {
	it('parses the solve endpoint format', () => {
		expect(parseServerTiming('decode;dur=3, solve;dur=120, encode;dur=8')).toEqual({
			decode: 3,
			solve: 120,
			encode: 8,
			raw: 'decode;dur=3, solve;dur=120, encode;dur=8'
		});
	});

	it('handles a subset of metrics', () => {
		expect(parseServerTiming('solve;dur=42')).toEqual({ solve: 42, raw: 'solve;dur=42' });
	});

	it('tolerates extra whitespace and casing in dur', () => {
		const t = parseServerTiming('  decode;DUR=1 , solve;dur=2 ');
		expect(t).toMatchObject({ decode: 1, solve: 2 });
	});

	it('ignores unknown metrics but still parses known ones', () => {
		expect(parseServerTiming('cache;dur=5, solve;dur=10')).toMatchObject({ solve: 10 });
	});

	it('returns null for a missing header', () => {
		expect(parseServerTiming(null)).toBeNull();
	});

	it('returns null when no recognizable metric is present', () => {
		expect(parseServerTiming('miss')).toBeNull();
		expect(parseServerTiming('cache;dur=5')).toBeNull();
	});

	it('skips a non-numeric dur', () => {
		expect(parseServerTiming('solve;dur=abc')).toBeNull();
	});
});

describe('onServerTiming callback', () => {
	it('fires with the parsed timing on a successful solve', async () => {
		const onServerTiming = vi.fn();
		fetchMock.mockResolvedValueOnce(
			createMockResponse(
				{ values: [] },
				{ headers: { 'Server-Timing': 'decode;dur=2, solve;dur=50, encode;dur=4' } }
			)
		);

		await fetchRhinoCompute('grasshopper', {}, { ...config, onServerTiming });

		expect(onServerTiming).toHaveBeenCalledTimes(1);
		expect(onServerTiming).toHaveBeenCalledWith(
			expect.objectContaining({ decode: 2, solve: 50, encode: 4 })
		);
	});

	it('does not fire when the response has no Server-Timing header', async () => {
		const onServerTiming = vi.fn();
		fetchMock.mockResolvedValueOnce(createMockResponse({ values: [] }));

		await fetchRhinoCompute('grasshopper', {}, { ...config, onServerTiming });

		expect(onServerTiming).not.toHaveBeenCalled();
	});

	it('a throwing callback does not fail the request', async () => {
		const onServerTiming = vi.fn(() => {
			throw new Error('boom');
		});
		fetchMock.mockResolvedValueOnce(
			createMockResponse({ values: [1] }, { headers: { 'Server-Timing': 'solve;dur=9' } })
		);

		await expect(
			fetchRhinoCompute('grasshopper', {}, { ...config, onServerTiming })
		).resolves.toEqual({ values: [1] });
		expect(onServerTiming).toHaveBeenCalled();
	});
});
