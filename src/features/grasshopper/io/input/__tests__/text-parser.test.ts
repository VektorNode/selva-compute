import { describe, expect, it } from 'vitest';
import { INPUT_TYPE_PARSERS } from '@/features/grasshopper/io/input/input-type-parsers';
import { createTextInputSchema } from '@tests/helpers/test-data-builders';
import type { BaseInputType, InputParamSchema } from '@/features/grasshopper/types';

const base: BaseInputType = {
	description: '',
	name: 'test',
	nickname: 'T',
	treeAccess: false,
	groupName: ''
};

function parseText(schema: InputParamSchema) {
	return INPUT_TYPE_PARSERS.get('Text')!.parse(schema, base) as any;
}

describe('text parser', () => {
	describe('quote removal', () => {
		it('should remove surrounding quotes', () => {
			expect(parseText(createTextInputSchema({ default: '"Hello World"' })).default).toBe(
				'Hello World'
			);
		});

		it('should handle empty quoted strings', () => {
			expect(parseText(createTextInputSchema({ default: '""' })).default).toBe('');
		});

		it('should not modify unquoted strings', () => {
			expect(parseText(createTextInputSchema({ default: 'Hello World' })).default).toBe(
				'Hello World'
			);
		});
	});

	describe('array handling', () => {
		it('should process arrays of quoted strings', () => {
			const result = parseText(createTextInputSchema({ default: ['"Hello"', '"World"', '"Test"'] }));
			expect(result.default).toEqual(['Hello', 'World', 'Test']);
		});

		it('should filter non-string values', () => {
			const result = parseText(
				createTextInputSchema({ default: ['"Hello"', 123, null, '"World"'] as any[] })
			);
			expect(result.default).toEqual(['Hello', 'World']);
		});
	});

	describe('real-world scenarios', () => {
		it('should process file paths with escaped backslashes', () => {
			const result = parseText(
				createTextInputSchema({ default: ['"C:\\\\file1.txt"', '"C:\\\\file2.txt"'] })
			);
			expect(result.default).toEqual(['C:\\\\file1.txt', 'C:\\\\file2.txt']);
		});

		it('should handle Unicode and special characters', () => {
			expect(parseText(createTextInputSchema({ default: '"Hello 世界 🌍"' })).default).toBe(
				'Hello 世界 🌍'
			);
		});
	});
});
