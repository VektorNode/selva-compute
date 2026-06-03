/**
 * CHARACTERIZATION TESTS for the input-parsing pipeline.
 *
 * These pin the CURRENT shipped behavior of `processInputWithError` /
 * `processInputs` (raw InputParamSchema -> typed InputParam) so the upcoming
 * "input-type parser" refactor can be proven behavior-identical. They assert
 * what the code does TODAY, including quirks — see the tree-access section and
 * CONTEXT.md "Known-suspicious behavior". Do not "fix" a quirk here; if a quirk
 * is a real bug, change it in a dedicated commit and update these tests then.
 */
import { describe, expect, it } from 'vitest';
import {
	processInput,
	processInputs,
	processInputWithError
} from '@/features/grasshopper/io/input/input-processors';
import { createInputSchema } from '@tests/helpers/test-data-builders';

describe('input pipeline characterization', () => {
	describe('Number / Integer', () => {
		it('coerces a string default to a number and derives step size', () => {
			const { input, error } = processInputWithError(
				createInputSchema({ paramType: 'Number', default: '1.5' })
			);
			expect(error).toBeUndefined();
			expect(input.paramType).toBe('Number');
			expect((input as any).default).toBe(1.5);
			expect((input as any).stepSize).toBe(0.1);
		});

		it('carries minimum/maximum/atLeast/atMost through onto the typed param', () => {
			const { input } = processInputWithError(
				createInputSchema({
					paramType: 'Number',
					default: 5,
					minimum: 0,
					maximum: 10,
					atLeast: 1,
					atMost: 1
				})
			);
			expect(input).toMatchObject({
				paramType: 'Number',
				minimum: 0,
				maximum: 10,
				atLeast: 1,
				atMost: 1
			});
			// step source falls back to maximum (10) -> integer-magnitude -> step 1
			expect((input as any).stepSize).toBe(1);
		});

		it('rounds Integer defaults and forces stepSize 1', () => {
			const { input } = processInputWithError(
				createInputSchema({ paramType: 'Integer', default: 42.7 })
			);
			expect(input.paramType).toBe('Integer');
			expect((input as any).default).toBe(43);
			expect((input as any).stepSize).toBe(1);
		});
	});

	describe('Boolean', () => {
		it('coerces a "true" string to boolean true', () => {
			const { input, error } = processInputWithError(
				createInputSchema({ paramType: 'Boolean', default: 'true' })
			);
			expect(error).toBeUndefined();
			expect(input.paramType).toBe('Boolean');
			expect((input as any).default).toBe(true);
		});

		it('an invalid boolean string is a recoverable failure -> safe default + error', () => {
			const { input, error } = processInputWithError(
				createInputSchema({ paramType: 'Boolean', default: 'maybe' })
			);
			expect(input.paramType).toBe('Boolean');
			expect((input as any).default).toBe(false); // scalar safe default
			expect(error).toBeDefined();
			expect(error?.paramType).toBe('Boolean');
		});

		it('list-shaped boolean fallback is [false] (atMost > 1)', () => {
			const { input, error } = processInputWithError(
				createInputSchema({ paramType: 'Boolean', default: 'maybe', atMost: 5 })
			);
			expect(error).toBeDefined();
			expect((input as any).default).toEqual([false]);
		});
	});

	describe('Text', () => {
		it('strips surrounding quotes', () => {
			const { input } = processInputWithError(
				createInputSchema({ paramType: 'Text', default: '"hello"' })
			);
			expect(input.paramType).toBe('Text');
			expect((input as any).default).toBe('hello');
		});

		it('passes a plain string through', () => {
			const { input } = processInputWithError(
				createInputSchema({ paramType: 'Text', default: 'world' })
			);
			expect((input as any).default).toBe('world');
		});
	});

	describe('ValueList', () => {
		it('builds a ValueList with its values map', () => {
			const { input, error } = processInputWithError(
				createInputSchema({
					paramType: 'ValueList',
					values: { A: '0', B: '1' },
					default: '0'
				})
			);
			expect(error).toBeUndefined();
			expect(input.paramType).toBe('ValueList');
			expect((input as any).values).toEqual({ A: '0', B: '1' });
			expect((input as any).default).toBe('0');
		});

		it('an out-of-range default only WARNS — it still succeeds (no error)', () => {
			const { input, error } = processInputWithError(
				createInputSchema({
					paramType: 'ValueList',
					values: { A: '0', B: '1' },
					default: 'not-a-key'
				})
			);
			expect(error).toBeUndefined();
			expect((input as any).default).toBe('not-a-key');
		});

		it('a missing values map is a recoverable failure -> safe default + error', () => {
			const { input, error } = processInputWithError(
				createInputSchema({ paramType: 'ValueList', values: undefined, default: 'x' })
			);
			expect(error).toBeDefined();
			expect(input.paramType).toBe('ValueList');
			expect((input as any).values).toEqual({});
		});
	});

	describe('Geometry / File (object parsing)', () => {
		it('parses a JSON-string Geometry default into an object', () => {
			const { input } = processInputWithError(
				createInputSchema({ paramType: 'Geometry', default: '{"x":1}' })
			);
			expect(input.paramType).toBe('Geometry');
			expect((input as any).default).toEqual({ x: 1 });
		});

		it('carries acceptedFormats through onto a File param', () => {
			const { input } = processInputWithError(
				createInputSchema({
					paramType: 'File',
					default: null,
					acceptedFormats: ['.3dm', '.obj']
				} as any)
			);
			expect(input.paramType).toBe('File');
			expect((input as any).acceptedFormats).toEqual(['.3dm', '.obj']);
		});
	});

	describe('Color', () => {
		it('trims and unquotes a color string, preserving it on failure-free path', () => {
			const { input } = processInputWithError(
				createInputSchema({ paramType: 'Color', default: '"255, 0, 0"' })
			);
			expect(input.paramType).toBe('Color');
			expect((input as any).default).toBe('255, 0, 0');
		});
	});

	describe('unknown type', () => {
		it('reports a VALIDATION_ERROR and falls back to a Geometry safe default', () => {
			const { input, error } = processInputWithError(
				createInputSchema({ paramType: 'definitelyNotAType' })
			);
			expect(error?.code).toBe('VALIDATION_ERROR');
			expect(error?.message).toContain('definitelyNotAType');
			expect(input.paramType).toBe('Geometry');
		});
	});

	describe('tree-access defaults (QUIRK — see CONTEXT.md)', () => {
		const treeDefault = {
			innerTree: { '{0}': [{ data: '1.5', type: 'System.Double' }] }
		};

		it('a tree-access Number default collapses to undefined; step derives from min/max', () => {
			const { input } = processInputWithError(
				createInputSchema({
					paramType: 'Number',
					treeAccess: true,
					default: treeDefault as any,
					minimum: 0.01
				})
			);
			expect((input as any).default).toBeUndefined();
			expect((input as any).stepSize).toBe(0.01);
		});

		it('an empty innerTree collapses the default to undefined', () => {
			const { input } = processInputWithError(
				createInputSchema({
					paramType: 'Number',
					default: { innerTree: {} } as any
				})
			);
			expect((input as any).default).toBeUndefined();
		});
	});

	describe('batch + facade signatures', () => {
		it('processInput returns just the typed param', () => {
			const result = processInput(createInputSchema({ paramType: 'Text', default: 'x' }));
			expect(result.paramType).toBe('Text');
			expect((result as any).default).toBe('x');
		});

		it('processInputs maps a batch and preserves order', () => {
			const results = processInputs([
				createInputSchema({ name: 'a', paramType: 'Number', default: 1 }),
				createInputSchema({ name: 'b', paramType: 'Text', default: 'y' })
			]);
			expect(results.map((r) => r.paramType)).toEqual(['Number', 'Text']);
			expect(results.map((r) => r.name)).toEqual(['a', 'b']);
		});
	});
});
