/**
 * Characterization tests for the output decode pipeline (response-processors.ts).
 *
 * This 285-line module — the output-side mirror of the input parser pipeline —
 * had no test coverage. These pin its CURRENT behavior: per-system-type
 * decoding, the tryDecodeJSON double-parse, the stringOnly filter, byId/byName
 * lookup, duplicate-key aggregation, WebDisplay exclusion, and extractFileData.
 *
 * They assert what the code does today, so any later deepening of the decode
 * dispatch can be proven behavior-identical.
 */
import { describe, expect, it } from 'vitest';
import {
	getValues,
	getValue,
	extractFileData
} from '@/features/grasshopper/io/output/response-processors';
import type { DataItem, GrasshopperComputeResponse } from '@/features/grasshopper/types';

// --- local builders ---------------------------------------------------------

function item(type: string, data: string, id = ''): DataItem {
	return { type, data, id };
}

/** One parameter with a single `{0}` branch holding the given items. */
function param(paramName: string, items: DataItem[], branch = '{0}') {
	return { ParamName: paramName, InnerTree: { [branch]: items } };
}

function response(...params: ReturnType<typeof param>[]): GrasshopperComputeResponse {
	return { values: params } as unknown as GrasshopperComputeResponse;
}

// --- decode by system type ---------------------------------------------------

describe('getValues — system type decoding', () => {
	it('decodes System.Int32 to a number', () => {
		const res = response(param('n', [item('System.Int32', '42')]));
		expect(getValues(res).values.n).toBe(42);
	});

	it('decodes System.Double to a float', () => {
		const res = response(param('x', [item('System.Double', '3.14')]));
		expect(getValues(res).values.x).toBe(3.14);
	});

	it('decodes System.Boolean to a boolean (case-insensitive)', () => {
		const res = response(param('b', [item('System.Boolean', 'True')]));
		expect(getValues(res).values.b).toBe(true);
	});

	it('strips surrounding quotes from System.String', () => {
		const res = response(param('s', [item('System.String', '"hello"')]));
		expect(getValues(res).values.s).toBe('hello');
	});

	it('leaves an unknown type untouched when no rhino instance is given', () => {
		const res = response(param('g', [item('Rhino.Geometry.Point3d', '{"X":1,"Y":2,"Z":3}')]));
		// parseValues default true → tryDecodeJSON parses it; no rhino → returned as the parsed object
		expect(getValues(res).values.g).toEqual({ X: 1, Y: 2, Z: 3 });
	});
});

// --- tryDecodeJSON double-parse ---------------------------------------------

describe('getValues — parseValues / JSON decoding', () => {
	it('parses a JSON object string into an object', () => {
		const res = response(param('o', [item('SomeType', '{"a":1}')]));
		expect(getValues(res).values.o).toEqual({ a: 1 });
	});

	it('double-parses a JSON-stringified-JSON string', () => {
		// outer parse yields a string, which is itself JSON → inner parse
		const res = response(param('o', [item('SomeType', JSON.stringify('{"a":1}'))]));
		expect(getValues(res).values.o).toEqual({ a: 1 });
	});

	it('with parseValues:false, does not JSON-decode (String type still unquoted)', () => {
		const res = response(param('o', [item('System.String', '{"a":1}')]));
		expect(getValues(res, false, { parseValues: false }).values.o).toEqual('{"a":1}');
	});

	it('leaves a non-JSON-looking string as-is', () => {
		const res = response(param('s', [item('System.String', 'plain text')]));
		expect(getValues(res).values.s).toBe('plain text');
	});
});

// --- aggregation & keys ------------------------------------------------------

describe('getValues — aggregation and keys', () => {
	it('aggregates multiple items under one ParamName into an array', () => {
		const res = response(
			param('nums', [
				item('System.Int32', '1'),
				item('System.Int32', '2'),
				item('System.Int32', '3')
			])
		);
		expect(getValues(res).values.nums).toEqual([1, 2, 3]);
	});

	it('keeps a single item as a scalar (not a 1-element array)', () => {
		const res = response(param('n', [item('System.Int32', '7')]));
		expect(getValues(res).values.n).toBe(7);
	});

	it('keys by item id when byId is true', () => {
		const res = response(param('ignored', [item('System.Int32', '9', 'item-id-1')]));
		const values = getValues(res, true).values;
		expect(values['item-id-1']).toBe(9);
		expect(values.ignored).toBeUndefined();
	});

	it('skips items with no key', () => {
		// byId with empty id → no key → skipped
		const res = response(param('p', [item('System.Int32', '1', '')]));
		expect(getValues(res, true).values).toEqual({});
	});
});

// --- filters -----------------------------------------------------------------

describe('getValues — filtering', () => {
	it('excludes WebDisplay-typed items entirely', () => {
		const res = response(
			param('mixed', [item('System.Int32', '1'), item('WebDisplay', 'whatever')])
		);
		// only the int survives, and as a scalar
		expect(getValues(res).values.mixed).toBe(1);
	});

	it('stringOnly keeps only System.String items', () => {
		const res = response(param('a', [item('System.String', '"keep"'), item('System.Int32', '5')]));
		// only the string survives, as a scalar
		expect(getValues(res, false, { stringOnly: true }).values.a).toBe('keep');
	});
});

// --- getValue ----------------------------------------------------------------

describe('getValue', () => {
	it('returns a single value byName', () => {
		const res = response(param('radius', [item('System.Double', '5')]));
		expect(getValue(res, { byName: 'radius' })).toBe(5);
	});

	it('returns an array byName when the param has multiple items', () => {
		const res = response(param('xs', [item('System.Int32', '1'), item('System.Int32', '2')]));
		expect(getValue(res, { byName: 'xs' })).toEqual([1, 2]);
	});

	it('returns undefined for an unknown name', () => {
		const res = response(param('a', [item('System.Int32', '1')]));
		expect(getValue(res, { byName: 'missing' })).toBeUndefined();
	});

	it('returns the matching item byId', () => {
		const res = response(
			param('p', [item('System.Int32', '1', 'id-a'), item('System.Int32', '2', 'id-b')])
		);
		expect(getValue(res, { byId: 'id-b' })).toBe(2);
	});

	it('returns undefined for an unknown id', () => {
		const res = response(param('p', [item('System.Int32', '1', 'id-a')]));
		expect(getValue(res, { byId: 'nope' })).toBeUndefined();
	});
});

// --- extractFileData ---------------------------------------------------------

describe('extractFileData', () => {
	const validFile = {
		fileName: 'out.txt',
		fileType: 'txt',
		data: 'aGk=',
		isBase64Encoded: true,
		subFolder: 'results'
	};

	it('extracts well-formed FileData items', () => {
		const res = response(param('files', [item('FileData', JSON.stringify(validFile))]));
		expect(extractFileData(res)).toEqual([validFile]);
	});

	it('ignores FileData items that fail the shape guard', () => {
		const res = response(param('files', [item('FileData', JSON.stringify({ fileName: 'x' }))]));
		expect(extractFileData(res)).toEqual([]);
	});

	it('ignores non-FileData items', () => {
		const res = response(param('n', [item('System.Int32', '1')]));
		expect(extractFileData(res)).toEqual([]);
	});
});
