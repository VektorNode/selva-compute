/**
 * Regression tests for the env-portable base64 string helpers: encodeStringToBase64
 * must work without Node's `Buffer` (browsers/workers), falling back to
 * TextEncoder + btoa. It used bare `Buffer` and threw a ReferenceError in
 * browsers — reachable from prepareGrasshopperArgs' plain-string path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { encodeStringToBase64, decodeBase64ToBinary } from '../encoding';

const originalBuffer = (globalThis as any).Buffer;

const decode = (b64: string): string => new TextDecoder('utf-8').decode(decodeBase64ToBinary(b64));

afterEach(() => {
	(globalThis as any).Buffer = originalBuffer;
});

describe('string base64 helpers', () => {
	it('round-trips with Buffer available (Node path)', () => {
		const encoded = encodeStringToBase64('hello wörld');
		expect(decode(encoded)).toBe('hello wörld');
	});

	it('round-trips without Buffer (browser fallback path)', () => {
		delete (globalThis as any).Buffer;

		const encoded = encodeStringToBase64('hello wörld');
		expect(decode(encoded)).toBe('hello wörld');
	});

	it('browser fallback produces the same base64 as the Buffer path', () => {
		const viaBuffer = encodeStringToBase64('multi-byte: ✓ 日本語');
		delete (globalThis as any).Buffer;
		const viaFallback = encodeStringToBase64('multi-byte: ✓ 日本語');
		expect(viaFallback).toBe(viaBuffer);
	});
});
