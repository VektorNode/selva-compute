/**
 * Tests for the debug-only "solve returned empty output(s)" warning. An empty
 * `InnerTree` on a solve output means that parameter produced no data — usually
 * a definition that didn't actually compute. The warning names each empty
 * output so you can trace it to the responsible branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warnOnEmptyInnerTrees } from '../solve';
import { setLogger } from '@/core/utils/logger';
import type { GrasshopperComputeResponse } from '../types';

const warn = vi.fn();

beforeEach(() => {
	warn.mockReset();
	setLogger({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() });
});
afterEach(() => setLogger(null));

/** The payload the user pasted: two outputs, both with empty InnerTree. */
function makeResponse(values: unknown[]): GrasshopperComputeResponse {
	return { values } as unknown as GrasshopperComputeResponse;
}

describe('warnOnEmptyInnerTrees', () => {
	it('does nothing when debug is off', () => {
		warnOnEmptyInnerTrees(makeResponse([{ ParamName: 'Display', InnerTree: {} }]), false);
		expect(warn).not.toHaveBeenCalled();
	});

	it('warns and names every empty output, flagged "all" when all are empty', () => {
		warnOnEmptyInnerTrees(
			makeResponse([
				{ ParamName: 'Display', InnerTree: {} },
				{ ParamName: 'Schema', InnerTree: {} }
			]),
			true
		);
		expect(warn).toHaveBeenCalledTimes(1);
		const msg = warn.mock.calls[0][0] as string;
		expect(msg).toContain('(all)');
		expect(msg).toContain('Display');
		expect(msg).toContain('Schema');
	});

	it('reports a partial ratio and only the empty names when some have data', () => {
		warnOnEmptyInnerTrees(
			makeResponse([
				{ ParamName: 'Display', InnerTree: {} },
				{ ParamName: 'Geometry', InnerTree: { '{0}': [{ type: 'x', data: '1' }] } }
			]),
			true
		);
		const msg = warn.mock.calls[0][0] as string;
		expect(msg).toContain('(1/2)');
		expect(msg).toContain('Display');
		expect(msg).not.toContain('Geometry');
	});

	it('does not warn when every output has data', () => {
		warnOnEmptyInnerTrees(
			makeResponse([{ ParamName: 'Geometry', InnerTree: { '{0}': [{ type: 'x', data: '1' }] } }]),
			true
		);
		expect(warn).not.toHaveBeenCalled();
	});

	it('reads casing case-insensitively (lowercase innerTree / paramName)', () => {
		warnOnEmptyInnerTrees(makeResponse([{ paramName: 'Display', innerTree: {} }]), true);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toContain('Display');
	});

	it('falls back to <unnamed> when a param has no name', () => {
		warnOnEmptyInnerTrees(makeResponse([{ InnerTree: {} }]), true);
		expect(warn.mock.calls[0][0]).toContain('<unnamed>');
	});

	it('does nothing for an empty or missing values array', () => {
		warnOnEmptyInnerTrees(makeResponse([]), true);
		warnOnEmptyInnerTrees({} as GrasshopperComputeResponse, true);
		expect(warn).not.toHaveBeenCalled();
	});
});
