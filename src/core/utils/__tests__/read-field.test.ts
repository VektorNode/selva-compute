import { describe, expect, it } from 'vitest';
import { readField, hasField } from '@/core/utils/read-field';

describe('readField', () => {
	it('reads an exact-case key', () => {
		expect(readField({ InnerTree: 1 }, 'InnerTree')).toBe(1);
	});

	it('reads a differently-cased key', () => {
		expect(readField({ InnerTree: 1 }, 'innerTree')).toBe(1);
		expect(readField({ innertree: 1 }, 'InnerTree')).toBe(1);
	});

	it('prefers the exact-case match when both are present', () => {
		// Defensive: if a payload somehow carried both, exact wins.
		expect(readField({ innerTree: 'lower', InnerTree: 'pascal' }, 'innerTree')).toBe('lower');
	});

	it('returns undefined when no key matches', () => {
		expect(readField({ a: 1 }, 'b')).toBeUndefined();
	});

	it('returns undefined for non-object inputs', () => {
		expect(readField(null, 'x')).toBeUndefined();
		expect(readField(undefined, 'x')).toBeUndefined();
		expect(readField('str', 'x')).toBeUndefined();
		expect(readField(42, 'x')).toBeUndefined();
	});

	it('preserves a present-but-null value (distinct from absent)', () => {
		expect(readField({ x: null }, 'x')).toBeNull();
	});
});

describe('hasField', () => {
	it('detects a key regardless of casing', () => {
		expect(hasField({ InnerTree: {} }, 'innerTree')).toBe(true);
		expect(hasField({ innerTree: {} }, 'InnerTree')).toBe(true);
	});

	it('is true even when the value is null/undefined', () => {
		expect(hasField({ x: null }, 'x')).toBe(true);
		expect(hasField({ x: undefined }, 'x')).toBe(true);
	});

	it('is false when the key is absent or input is not an object', () => {
		expect(hasField({ a: 1 }, 'b')).toBe(false);
		expect(hasField(null, 'x')).toBe(false);
	});
});
