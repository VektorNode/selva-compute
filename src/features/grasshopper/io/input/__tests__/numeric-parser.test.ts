// src/features/grasshopper/io/input/input-parsers/__tests__/numeric-parser.test.ts
import { describe, expect, it } from 'vitest';
import { processNumericInput } from '@/features/grasshopper/io/input/input-parsers';
import { createNumericInputSchema } from '@tests/helpers/test-data-builders';

describe('processNumericInput', () => {
	describe('basic conversions', () => {
		it('should convert string numbers to numbers', () => {
			const input = createNumericInputSchema({ default: '42' });
			processNumericInput(input);
			expect(input.default).toBe(42);
		});

		it('should handle decimal strings', () => {
			const input = createNumericInputSchema({ default: '3.14' });
			processNumericInput(input);
			expect(input.default).toBe(3.14);
		});

		it('should handle arrays of string numbers', () => {
			const input = createNumericInputSchema({ default: ['1', '2', '3'] });
			processNumericInput(input);
			expect(input.default).toEqual([1, 2, 3]);
		});

		it('should filter invalid values from arrays', () => {
			const input = createNumericInputSchema({
				default: ['1', 'invalid', '3', null] as any[]
			});
			processNumericInput(input);
			expect(input.default).toEqual([1, 3]);
		});
	});

	describe('integer handling', () => {
		it('should round decimals for Integer type', () => {
			const input = createNumericInputSchema({ paramType: 'Integer', default: 42.7 });
			processNumericInput(input);
			expect(input.default).toBe(43);
			expect(input.stepSize).toBe(1);
		});

		it('should round arrays for Integer type', () => {
			const input = createNumericInputSchema({ paramType: 'Integer', default: [1.2, 2.7, 3.5] });
			processNumericInput(input);
			expect(input.default).toEqual([1, 3, 4]);
		});
	});

	describe('step size calculation', () => {
		it('should calculate step size from decimal precision', () => {
			const input = createNumericInputSchema({ default: 1.5 });
			processNumericInput(input);
			expect(input.stepSize).toBe(0.1);
		});

		it('should use minimum for step when default is 0', () => {
			const input = createNumericInputSchema({ default: 0, minimum: 0.01 });
			processNumericInput(input);
			expect(input.stepSize).toBe(0.01);
		});
	});

	describe('real-world scenarios', () => {
		it('should process typical Grasshopper slider', () => {
			const input = createNumericInputSchema({
				name: 'Radius',
				default: 5.0,
				minimum: 0,
				maximum: 10
			});
			processNumericInput(input);
			expect(input.default).toBe(5.0);
			expect(input.stepSize).toBe(1);
		});

		it('should process coordinate lists', () => {
			const input = createNumericInputSchema({
				default: ['0', '1.5', '3.0', '4.5']
			});
			processNumericInput(input);
			expect(input.default).toEqual([0, 1.5, 3.0, 4.5]);
		});
	});
});
