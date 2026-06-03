import { describe, expect, it } from 'vitest';
import { INPUT_TYPE_PARSERS } from '@/features/grasshopper/io/input/input-type-parsers';
import { createBooleanInputSchema } from '@tests/helpers/test-data-builders';
import { RhinoComputeError } from '@/core';
import type { BaseInputType, InputParamSchema } from '@/features/grasshopper/types';

const base: BaseInputType = {
	description: '',
	name: 'test',
	nickname: 'T',
	treeAccess: false,
	groupName: ''
};

function parseBoolean(schema: InputParamSchema) {
	return INPUT_TYPE_PARSERS.get('Boolean')!.parse(schema, base) as any;
}

describe('boolean parser', () => {
	describe('string conversions', () => {
		it('should convert string booleans (case-insensitive)', () => {
			expect(parseBoolean(createBooleanInputSchema({ default: 'true' })).default).toBe(true);
			expect(parseBoolean(createBooleanInputSchema({ default: 'FALSE' })).default).toBe(false);
		});

		it('should throw error for invalid boolean string', () => {
			const input = createBooleanInputSchema({ default: 'invalid' });
			expect(() => parseBoolean(input)).toThrow(RhinoComputeError);
		});
	});

	describe('array handling', () => {
		it('should convert arrays of string booleans', () => {
			const result = parseBoolean(createBooleanInputSchema({ default: ['true', 'False', 'TRUE'] }));
			expect(result.default).toEqual([true, false, true]);
		});

		it('should filter non-boolean values', () => {
			const result = parseBoolean(
				createBooleanInputSchema({ default: [true, 123, 'false', null] as any[] })
			);
			expect(result.default).toEqual([true, false]);
		});
	});

	describe('real-world scenarios', () => {
		it('should process Grasshopper toggle', () => {
			expect(parseBoolean(createBooleanInputSchema({ name: 'Toggle', default: 'false' })).default).toBe(
				false
			);
		});

		it('should process boolean lists for conditional logic', () => {
			const result = parseBoolean(
				createBooleanInputSchema({ default: ['true', 'true', 'false', 'true'] })
			);
			expect(result.default).toEqual([true, true, false, true]);
		});
	});
});
