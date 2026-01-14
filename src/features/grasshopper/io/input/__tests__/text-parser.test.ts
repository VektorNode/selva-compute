// src/features/grasshopper/io/input/input-parsers/__tests__/text-parser.test.ts
import { describe, expect, it } from 'vitest';
import { processTextInput } from '@/features/grasshopper/io/input/input-parsers';
import { createTextInputSchema } from '@tests/helpers/test-data-builders';

describe('processTextInput', () => {
	describe('quote removal', () => {
		it('should remove surrounding quotes', () => {
			const input = createTextInputSchema({ default: '"Hello World"' });
			processTextInput(input);
			expect(input.default).toBe('Hello World');
		});

		it('should handle empty quoted strings', () => {
			const input = createTextInputSchema({ default: '""' });
			processTextInput(input);
			expect(input.default).toBe('');
		});

		it('should not modify unquoted strings', () => {
			const input = createTextInputSchema({ default: 'Hello World' });
			processTextInput(input);
			expect(input.default).toBe('Hello World');
		});
	});

	describe('array handling', () => {
		it('should process arrays of quoted strings', () => {
			const input = createTextInputSchema({ default: ['"Hello"', '"World"', '"Test"'] });
			processTextInput(input);
			expect(input.default).toEqual(['Hello', 'World', 'Test']);
		});

		it('should filter non-string values', () => {
			const input = createTextInputSchema({
				default: ['"Hello"', 123, null, '"World"'] as any[]
			});
			processTextInput(input);
			expect(input.default).toEqual(['Hello', 'World']);
		});
	});

	describe('real-world scenarios', () => {
		it('should process file paths with escaped backslashes', () => {
			const input = createTextInputSchema({
				default: ['"C:\\\\file1.txt"', '"C:\\\\file2.txt"']
			});
			processTextInput(input);
			expect(input.default).toEqual(['C:\\\\file1.txt', 'C:\\\\file2.txt']);
		});

		it('should handle Unicode and special characters', () => {
			const input = createTextInputSchema({ default: '"Hello 世界 🌍"' });
			processTextInput(input);
			expect(input.default).toBe('Hello 世界 🌍');
		});
	});
});
