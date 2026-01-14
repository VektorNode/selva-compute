// src/features/grasshopper/io/input/input-parsers/__tests__/boolean-parser.test.ts
import { describe, expect, it } from 'vitest';
import { processBooleanInput } from '@/features/grasshopper/io/input/input-parsers';
import { createBooleanInputSchema } from '@tests/helpers/test-data-builders';
import { RhinoComputeError } from '@/core';

describe('processBooleanInput', () => {
	describe('string conversions', () => {
		it('should convert string booleans (case-insensitive)', () => {
			expect(createBooleanInputSchema({ default: 'true' })).toSatisfy((input) => {
				processBooleanInput(input);
				return input.default === true;
			});

			expect(createBooleanInputSchema({ default: 'FALSE' })).toSatisfy((input) => {
				processBooleanInput(input);
				return input.default === false;
			});
		});

		it('should throw error for invalid boolean string', () => {
			const input = createBooleanInputSchema({ default: 'invalid' });
			expect(() => processBooleanInput(input)).toThrow(RhinoComputeError);
		});
	});

	describe('array handling', () => {
		it('should convert arrays of string booleans', () => {
			const input = createBooleanInputSchema({ default: ['true', 'False', 'TRUE'] });
			processBooleanInput(input);
			expect(input.default).toEqual([true, false, true]);
		});

		it('should filter non-boolean values and throw on invalid strings', () => {
			const input = createBooleanInputSchema({
				default: [true, 123, 'false', null] as any[]
			});
			processBooleanInput(input);
			expect(input.default).toEqual([true, false]);
		});
	});

	describe('real-world scenarios', () => {
		it('should process Grasshopper toggle', () => {
			const input = createBooleanInputSchema({
				name: 'Toggle',
				default: 'false'
			});
			processBooleanInput(input);
			expect(input.default).toBe(false);
		});

		it('should process boolean lists for conditional logic', () => {
			const input = createBooleanInputSchema({
				default: ['true', 'true', 'false', 'true']
			});
			processBooleanInput(input);
			expect(input.default).toEqual([true, true, false, true]);
		});
	});
});
