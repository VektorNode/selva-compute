import { describe, it, expect } from 'vitest';
import { prepareGrasshopperArgs } from '../solve';
import { isBase64 } from '@/core/utils/encoding';

describe('solve', () => {
	describe('prepareGrasshopperArgs', () => {
		it('should handle URL definition as pointer', () => {
			const definition = 'https://example.com/definition.gh';
			const dataTree: any[] = [];

			const result = prepareGrasshopperArgs(definition, dataTree);

			expect(result.pointer).toBe(definition);
			expect(result.algo).toBeNull();
			expect(result.values).toEqual(dataTree);
		});

		it('should encode plain string definition to base64', () => {
			const definition = 'plain text definition';
			const dataTree: any[] = [];

			const result = prepareGrasshopperArgs(definition, dataTree);

			expect(result.algo).toBeTruthy();
			expect(result.pointer).toBeNull();
			// Verify it's valid base64
			expect(isBase64(result.algo!)).toBe(true);
		});

		it('should pass through existing base64 string', () => {
			const base64Definition = Buffer.from('test').toString('base64');
			const dataTree: any[] = [];

			const result = prepareGrasshopperArgs(base64Definition, dataTree);

			expect(result.algo).toBe(base64Definition);
			expect(result.pointer).toBeNull();
		});

		it('should encode Uint8Array to base64', () => {
			const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
			const dataTree: any[] = [];

			const result = prepareGrasshopperArgs(binaryData, dataTree);

			expect(result.algo).toBeTruthy();
			expect(result.pointer).toBeNull();
			expect(isBase64(result.algo!)).toBe(true);
		});

		it('should preserve data tree values', () => {
			const definition = 'http://example.com/test.gh';
			const dataTree: any[] = [
				{ ParamName: 'Input1', InnerTree: {} },
				{ ParamName: 'Input2', InnerTree: {} }
			];

			const result = prepareGrasshopperArgs(definition, dataTree);

			expect(result.values).toEqual(dataTree);
			expect(result.values).toHaveLength(2);
		});
	});

	describe('isBase64', () => {
		it('should return true for valid base64 strings', () => {
			const validBase64 = Buffer.from('Hello World').toString('base64');
			expect(isBase64(validBase64)).toBe(true);
		});

		it('should return false for invalid base64 strings', () => {
			expect(isBase64('not base64!!!')).toBe(false);
			expect(isBase64('plain text')).toBe(false);
			expect(isBase64('')).toBe(false);
		});

		it('should handle edge cases', () => {
			expect(isBase64('=')).toBe(false);
			expect(isBase64('==')).toBe(false);
			expect(isBase64('A')).toBe(false); // Invalid padding
		});

		it('should validate common base64 patterns', () => {
			const tests = [
				{ input: 'SGVsbG8=', expected: true }, // "Hello"
				{ input: 'V29ybGQ=', expected: true }, // "World"
				{ input: 'MTIzNDU2', expected: true }, // "123456"
				{ input: 'not-base64', expected: false }
			];

			tests.forEach(({ input, expected }) => {
				expect(isBase64(input)).toBe(expected);
			});
		});
	});
});
