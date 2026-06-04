import { describe, it, expect } from 'vitest';

import { validateServerUrl } from '../validate-server-url';
import { RhinoComputeError, ErrorCodes } from '@/core/errors';

const expectInvalidConfig = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(RhinoComputeError);
		expect((err as RhinoComputeError).code).toBe(ErrorCodes.INVALID_CONFIG);
		return;
	}
	throw new Error('expected validateServerUrl to throw');
};

describe('validateServerUrl', () => {
	it('accepts a well-formed http(s) URL and returns it normalized', () => {
		expect(validateServerUrl('http://localhost:6500')).toBe('http://localhost:6500');
		expect(validateServerUrl('https://example.com')).toBe('https://example.com');
	});

	it('strips trailing slashes', () => {
		expect(validateServerUrl('http://localhost:6500/')).toBe('http://localhost:6500');
		expect(validateServerUrl('http://localhost:6500///')).toBe('http://localhost:6500');
	});

	it('rejects empty / whitespace-only URLs', () => {
		expectInvalidConfig(() => validateServerUrl(''));
		expectInvalidConfig(() => validateServerUrl('   '));
		expectInvalidConfig(() => validateServerUrl(undefined as unknown as string));
	});

	// Scheme check — previously enforced by ComputeServerStats but MISSING from the
	// client's validator. Unifying must enforce it on both paths.
	it('rejects URLs without an http(s):// scheme', () => {
		expectInvalidConfig(() => validateServerUrl('ftp://example.com'));
		expectInvalidConfig(() => validateServerUrl('example.com'));
		expectInvalidConfig(() => validateServerUrl('ws://localhost:6500'));
	});

	// Public-endpoint check — previously enforced by the client but MISSING from
	// ComputeServerStats. Unifying must enforce it on both paths.
	it('rejects the default public McNeel endpoint', () => {
		expectInvalidConfig(() => validateServerUrl('https://compute.rhino3d.com/'));
	});
});
