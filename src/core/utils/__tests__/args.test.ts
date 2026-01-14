import { describe, expect, it } from 'vitest';
import { zipArgs } from '../args';

describe('zipArgs', () => {
	describe('multiple=false (single tuple mode)', () => {
		it('should return args as-is', () => {
			expect(zipArgs(false, 1, 2, 3)).toEqual([1, 2, 3]);
			expect(zipArgs(false, 'hello')).toEqual(['hello']);
			expect(zipArgs(false)).toEqual([]);
		});

		it('should handle mixed types including arrays', () => {
			expect(zipArgs(false, 1, 'string', true, null)).toEqual([1, 'string', true, null]);
			expect(zipArgs(false, [1, 2], [3, 4])).toEqual([
				[1, 2],
				[3, 4]
			]);
		});
	});

	describe('multiple=true (transpose mode)', () => {
		it('should transpose arrays into tuples', () => {
			expect(zipArgs(true, [1, 2, 3], ['a', 'b', 'c'])).toEqual([
				[1, 'a'],
				[2, 'b'],
				[3, 'c']
			]);
		});

		it('should handle single array', () => {
			expect(zipArgs(true, [1, 2, 3])).toEqual([[1], [2], [3]]);
		});

		it('should handle three or more arrays', () => {
			expect(zipArgs(true, [1, 2], ['a', 'b'], [true, false])).toEqual([
				[1, 'a', true],
				[2, 'b', false]
			]);
		});

		it('should handle empty arrays', () => {
			expect(zipArgs(true)).toEqual([]);
			expect(zipArgs(true, [], [])).toEqual([]);
		});
	});

	describe('edge cases', () => {
		it('should handle null and undefined values', () => {
			expect(zipArgs(true, [1, null, 3], [undefined, 'b', 'c'])).toEqual([
				[1, undefined],
				[null, 'b'],
				[3, 'c']
			]);
		});

		it('should handle nested arrays', () => {
			expect(
				zipArgs(
					true,
					[
						[1, 2],
						[3, 4]
					],
					[
						['a', 'b'],
						['c', 'd']
					]
				)
			).toEqual([
				[
					[1, 2],
					['a', 'b']
				],
				[
					[3, 4],
					['c', 'd']
				]
			]);
		});

		it('should use length of first array for transposition', () => {
			expect(zipArgs(true, [1, 2], ['a', 'b', 'c', 'd'])).toEqual([
				[1, 'a'],
				[2, 'b']
			]);
		});
	});

	describe('real-world use cases', () => {
		it('should handle Grasshopper-style single value parameters', () => {
			const result = zipArgs(false, 10, 20, 30);
			expect(result).toEqual([10, 20, 30]);
		});

		it('should handle Grasshopper-style batch processing', () => {
			const xValues = [1, 2, 3];
			const yValues = [10, 20, 30];
			const zValues = [100, 200, 300];

			const result = zipArgs(true, xValues, yValues, zValues);
			expect(result).toEqual([
				[1, 10, 100],
				[2, 20, 200],
				[3, 30, 300]
			]);
		});
	});
});
