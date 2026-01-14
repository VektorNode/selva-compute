import { describe, expect, it } from 'vitest';
import { camelcaseKeys } from '../camel-case';

describe('camelcaseKeys', () => {
	describe('basic conversion', () => {
		it('should convert various naming conventions to camelCase', () => {
			expect(camelcaseKeys({ hello_world: 'value' })).toEqual({ helloWorld: 'value' });
			expect(camelcaseKeys({ 'hello-world': 'value' })).toEqual({ helloWorld: 'value' });
			expect(camelcaseKeys({ HelloWorld: 'value' })).toEqual({ helloWorld: 'value' });
			expect(camelcaseKeys({ helloWorld: 'value' })).toEqual({ helloWorld: 'value' });
		});

		it('should handle multiple keys and mixed separators', () => {
			expect(
				camelcaseKeys({
					first_name: 'John',
					last_name: 'Doe',
					'email-address': 'john@example.com'
				})
			).toEqual({
				firstName: 'John',
				lastName: 'Doe',
				emailAddress: 'john@example.com'
			});

			expect(camelcaseKeys({ 'hello-world_test-case': 'value' })).toEqual({
				helloWorldTestCase: 'value'
			});
		});
	});

	describe('deep conversion', () => {
		it('should convert nested objects when deep=true', () => {
			const input = {
				outer_key: {
					inner_key: 'value'
				}
			};
			const expected = {
				outerKey: {
					innerKey: 'value'
				}
			};
			expect(camelcaseKeys(input, { deep: true })).toEqual(expected);
		});

		it('should not convert nested objects when deep=false', () => {
			const input = {
				outer_key: {
					inner_key: 'value'
				}
			};
			const expected = {
				outerKey: {
					inner_key: 'value'
				}
			};
			expect(camelcaseKeys(input, { deep: false })).toEqual(expected);
		});

		it('should convert arrays of objects when deep=true', () => {
			const input = {
				items: [{ first_name: 'John' }, { first_name: 'Jane' }]
			};
			const expected = {
				items: [{ firstName: 'John' }, { firstName: 'Jane' }]
			};
			expect(camelcaseKeys(input, { deep: true })).toEqual(expected);
		});

		it('should not convert arrays of objects when deep=false', () => {
			const input = {
				items: [{ first_name: 'John' }]
			};
			const expected = {
				items: [{ first_name: 'John' }]
			};
			expect(camelcaseKeys(input, { deep: false })).toEqual(expected);
		});
	});

	describe('edge cases', () => {
		it('should handle null, undefined, and primitives', () => {
			expect(camelcaseKeys(null)).toBeNull();
			expect(camelcaseKeys(undefined)).toBeUndefined();
			expect(camelcaseKeys(42)).toBe(42);
			expect(camelcaseKeys('string')).toBe('string');
		});

		it('should handle empty objects and arrays', () => {
			expect(camelcaseKeys({})).toEqual({});
			expect(camelcaseKeys({ items: [] })).toEqual({ items: [] });
		});
	});

	describe('real-world scenario', () => {
		it('should handle complex Grasshopper API response', () => {
			const input = {
				Response_Data: {
					Output_Values: [
						{
							Param_Name: 'Result',
							Inner_Tree: { tree_path: '{0}' }
						}
					]
				}
			};
			const expected = {
				responseData: {
					outputValues: [
						{
							paramName: 'Result',
							innerTree: { treePath: '{0}' }
						}
					]
				}
			};
			expect(camelcaseKeys(input, { deep: true })).toEqual(expected);
		});
	});
});
