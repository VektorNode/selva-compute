import { describe, it, expect } from 'vitest';
import { hashSolveInput, stableStringify, fnv1a, fnv1aBytes } from '../stable-hash';

describe('stableStringify', () => {
	it('is key-order independent for objects', () => {
		expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
	});

	it('distinguishes different values', () => {
		expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
	});

	it('handles circular references without throwing', () => {
		const obj: any = { a: 1 };
		obj.self = obj;
		expect(() => stableStringify(obj)).not.toThrow();
	});

	it('normalizes non-finite numbers to null', () => {
		expect(stableStringify(NaN)).toBe(stableStringify(null));
		expect(stableStringify(Infinity)).toBe(stableStringify(null));
	});
});

describe('fnv1a / fnv1aBytes', () => {
	it('returns an 8-char hex string', () => {
		expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/);
		expect(fnv1aBytes(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{8}$/);
	});

	it('agrees with fnv1a when bytes are ASCII char codes', () => {
		// fnv1aBytes over the char codes of "abc" must equal fnv1a("abc").
		const bytes = new Uint8Array([...'abc'].map((c) => c.charCodeAt(0)));
		expect(fnv1aBytes(bytes)).toBe(fnv1a('abc'));
	});

	it('distinguishes different byte content', () => {
		expect(fnv1aBytes(new Uint8Array([1, 2, 3]))).not.toBe(fnv1aBytes(new Uint8Array([3, 2, 1])));
	});
});

describe('hashSolveInput', () => {
	const tree = [{ ParamName: 'x', InnerTree: {} }];

	it('is stable for identical inputs', () => {
		expect(hashSolveInput('def.gh', tree)).toBe(hashSolveInput('def.gh', tree));
	});

	it('changes when the definition changes', () => {
		expect(hashSolveInput('a.gh', tree)).not.toBe(hashSolveInput('b.gh', tree));
	});

	it('changes when the data tree changes', () => {
		const other = [{ ParamName: 'y', InnerTree: {} }];
		expect(hashSolveInput('def.gh', tree)).not.toBe(hashSolveInput('def.gh', other));
	});

	// Regression: a binary definition was previously keyed on length alone, so two
	// different files of equal length produced the same cache key and one's solve
	// was served for the other.
	it('does not collide for different binary definitions of equal length', () => {
		const a = new Uint8Array([1, 2, 3, 4]);
		const b = new Uint8Array([4, 3, 2, 1]);
		expect(a.length).toBe(b.length);
		expect(hashSolveInput(a, tree)).not.toBe(hashSolveInput(b, tree));
	});

	it('does not collide for binary definitions sharing endpoints but differing in the middle', () => {
		// Same first-32 and last-32 bytes + same length — would collide under a
		// sampled key, but full-content hashing separates them.
		const head = new Uint8Array(32).fill(7);
		const tail = new Uint8Array(32).fill(9);
		const a = new Uint8Array([...head, ...new Uint8Array(64).fill(1), ...tail]);
		const b = new Uint8Array([...head, ...new Uint8Array(64).fill(2), ...tail]);
		expect(a.length).toBe(b.length);
		expect(hashSolveInput(a, tree)).not.toBe(hashSolveInput(b, tree));
	});
});
