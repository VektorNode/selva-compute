import { describe, expect, it } from 'vitest';
import { INPUT_TYPE_PARSERS } from '@/features/grasshopper/io/input/input-type-parsers';
import { createNumericInputSchema } from '@tests/helpers/test-data-builders';
import type { BaseInputType, InputParamSchema } from '@/features/grasshopper/types';

const base: BaseInputType = {
	description: '',
	name: 'test',
	nickname: 'T',
	treeAccess: false,
	groupName: ''
};

// Parse a numeric schema through the registry's Number parser and return the
// typed param. Defaults are assumed already normalized (these schemas use
// scalar/array defaults, not innerTree).
function parseNumeric(schema: InputParamSchema) {
	const parser = INPUT_TYPE_PARSERS.get(schema.paramType === 'Integer' ? 'Integer' : 'Number')!;
	return parser.parse(schema, base) as any;
}

describe('numeric parser', () => {
	describe('basic conversions', () => {
		it('should convert string numbers to numbers', () => {
			expect(parseNumeric(createNumericInputSchema({ default: '42' })).default).toBe(42);
		});

		it('should handle decimal strings', () => {
			expect(parseNumeric(createNumericInputSchema({ default: '3.14' })).default).toBe(3.14);
		});

		it('should handle arrays of string numbers', () => {
			expect(parseNumeric(createNumericInputSchema({ default: ['1', '2', '3'] })).default).toEqual([
				1, 2, 3
			]);
		});

		it('should filter invalid values from arrays', () => {
			const result = parseNumeric(
				createNumericInputSchema({ default: ['1', 'invalid', '3', null] as any[] })
			);
			expect(result.default).toEqual([1, 3]);
		});
	});

	describe('integer handling', () => {
		it('should round decimals for Integer type', () => {
			const result = parseNumeric(
				createNumericInputSchema({ paramType: 'Integer', default: 42.7 })
			);
			expect(result.default).toBe(43);
			expect(result.stepSize).toBe(1);
		});

		it('should round arrays for Integer type', () => {
			const result = parseNumeric(
				createNumericInputSchema({ paramType: 'Integer', default: [1.2, 2.7, 3.5] })
			);
			expect(result.default).toEqual([1, 3, 4]);
		});
	});

	describe('step size calculation', () => {
		it('should calculate step size from decimal precision', () => {
			expect(parseNumeric(createNumericInputSchema({ default: 1.5 })).stepSize).toBe(0.1);
		});

		it('should use minimum for step when default is 0', () => {
			expect(parseNumeric(createNumericInputSchema({ default: 0, minimum: 0.01 })).stepSize).toBe(
				0.01
			);
		});
	});

	describe('real-world scenarios', () => {
		it('should process typical Grasshopper slider', () => {
			const result = parseNumeric(
				createNumericInputSchema({ name: 'Radius', default: 5.0, minimum: 0, maximum: 10 })
			);
			expect(result.default).toBe(5.0);
			expect(result.stepSize).toBe(1);
		});

		it('should process coordinate lists', () => {
			const result = parseNumeric(
				createNumericInputSchema({ default: ['0', '1.5', '3.0', '4.5'] })
			);
			expect(result.default).toEqual([0, 1.5, 3.0, 4.5]);
		});
	});
});
