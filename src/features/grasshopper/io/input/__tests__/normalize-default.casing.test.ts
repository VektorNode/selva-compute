/**
 * WIRE-CASING REGRESSION TESTS for `normalizeDefault`.
 *
 * These pin the real on-the-wire shape of an input's `default`, which the
 * characterization tests got wrong: they hand-wrote lowercase `innerTree`,
 * but every known server branch sends the `default` DataTree wrapper as
 * PascalCase `ParamName` / `InnerTree` (it's the external
 * `Resthopper.IO.DataTree`, which no fork can re-attribute). See
 * normalize-default.ts and tests/contract/server-contract.test.ts.
 *
 * The beta (PR #52) removed a global `camelcaseKeys` pass — correct, because it
 * mangled value-list label keys — but `normalizeDefault` still literal-matched
 * lowercase `innerTree`, so every connected default silently collapsed to
 * `null`. These tests fail against that regression and pass once the wrapper is
 * read case-insensitively.
 */
import { describe, expect, it } from 'vitest';
import { processInputWithError } from '@/features/grasshopper/io/input/input-processors';
import { createInputSchema } from '@tests/helpers/test-data-builders';

/** A connected single-value Number default exactly as Compute8 / mcneel 8.x send it. */
const pascalCaseDefault = {
	ParamName: 'Get Number',
	InnerTree: {
		'{0}': [{ type: 'System.Double', data: '42.5', id: '00000000-0000-0000-0000-000000000000' }]
	}
};

describe('normalizeDefault — real wire casing (PascalCase InnerTree)', () => {
	it('parses a PascalCase single-value Number default instead of nulling it', () => {
		const { input } = processInputWithError(
			createInputSchema({ paramType: 'Number', default: pascalCaseDefault as any })
		);
		// Regression: this used to be `null`.
		expect((input as any).default).toBe(42.5);
	});

	it('parses a PascalCase tree-access default into a DataTreeDefault', () => {
		const { input } = processInputWithError(
			createInputSchema({
				paramType: 'Number',
				treeAccess: true,
				default: {
					ParamName: 'Get Number',
					InnerTree: {
						'{0}': [
							{ type: 'System.Double', data: '1.5' },
							{ type: 'System.Double', data: '2.5' }
						],
						'{1}': [{ type: 'System.Double', data: '3.5' }]
					}
				} as any
			})
		);
		expect((input as any).default).toEqual({ '{0}': [1.5, 2.5], '{1}': [3.5] });
	});

	it('treats an empty PascalCase InnerTree as undefined (not null)', () => {
		const { input } = processInputWithError(
			createInputSchema({ paramType: 'Number', default: { ParamName: 'x', InnerTree: {} } as any })
		);
		expect((input as any).default).toBeUndefined();
	});

	it('still parses lowercase innerTree (forward-compatible if a branch camelCases it)', () => {
		const { input } = processInputWithError(
			createInputSchema({
				paramType: 'Number',
				default: {
					paramName: 'x',
					innerTree: { '{0}': [{ type: 'System.Double', data: '7' }] }
				} as any
			})
		);
		expect((input as any).default).toBe(7);
	});

	it('GUARD: a non-empty tree default must never collapse to null', () => {
		// The exact failure mode of the shipped beta — a default that clearly holds
		// data should never silently disappear, regardless of wrapper casing.
		for (const wrapper of ['InnerTree', 'innerTree'] as const) {
			const { input } = processInputWithError(
				createInputSchema({
					paramType: 'Number',
					default: { [wrapper]: { '{0}': [{ type: 'System.Double', data: '9' }] } } as any
				})
			);
			expect((input as any).default).not.toBeNull();
			expect((input as any).default).toBe(9);
		}
	});

	it('keeps a bracket-leading System.String tree value as a string (no JSON.parse)', () => {
		// Regression: a multi-value Dynamic_ValueList sends string labels that can
		// start with `[`/`{`. The 2.0 beta JSON-parsed `System.String` items, turning
		// `'[1,2,3]'` into a real array on the leaf `data` — which the Rhino.Compute
		// fork's Newtonsoft reader rejects. String defaults must round-trip unchanged.
		const { input } = processInputWithError(
			createInputSchema({
				paramType: 'Text',
				treeAccess: true,
				default: {
					ParamName: 'Values',
					InnerTree: {
						'{0}': [
							{ type: 'System.String', data: '[1,2,3]' },
							{ type: 'System.String', data: '{not json' },
							{ type: 'System.String', data: 'plain' }
						]
					}
				} as any
			})
		);
		expect((input as any).default).toEqual({ '{0}': ['[1,2,3]', '{not json', 'plain'] });
	});

	it('warns and nulls only a genuinely unknown shape (no tree key at all)', () => {
		const { input } = processInputWithError(
			createInputSchema({ paramType: 'Number', default: { somethingElse: 1 } as any })
		);
		expect((input as any).default).toBeNull();
	});

	it('surfaces a MALFORMED_DEFAULT parse error for an unknown default shape', () => {
		const { input, error } = processInputWithError(
			createInputSchema({
				name: 'Weird',
				paramType: 'Number',
				default: { somethingElse: 1 } as any
			})
		);
		expect((input as any).default).toBeNull();
		expect(error?.code).toBe('MALFORMED_DEFAULT');
		expect(error?.inputName).toBe('Weird');
		expect(error?.message).toContain('Weird');
	});

	it('does NOT emit a parse error for a well-formed default', () => {
		const { error } = processInputWithError(
			createInputSchema({ paramType: 'Number', default: pascalCaseDefault as any })
		);
		expect(error).toBeUndefined();
	});
});
