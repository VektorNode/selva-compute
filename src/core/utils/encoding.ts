import { RhinoComputeError, ErrorCodes } from '../errors';

/**
 * Encodes a string to base64 (Node 20+ safe)
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * @param str - String to encode
 * @returns Base64 encoded string
 */
export function encodeStringToBase64(str: string): string {
	if (typeof (globalThis as any).Buffer === 'function') {
		return (globalThis as any).Buffer.from(str, 'utf-8').toString('base64');
	}
	// Browser/worker fallback: UTF-8 encode, then reuse the byte-array encoder.
	return base64ByteArray(new TextEncoder().encode(str));
}

/**
 * Decodes a base64 string to a UTF-8 string (Node 20+ safe)
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * @param base64Str - Base64 encoded string
 * @returns Decoded UTF-8 string
 */
export function decodeBase64ToString(base64Str: string): string {
	if (typeof (globalThis as any).Buffer === 'function') {
		return (globalThis as any).Buffer.from(base64Str, 'base64').toString('utf-8');
	}
	// Browser/worker fallback: decode to bytes, then UTF-8 decode.
	return new TextDecoder('utf-8').decode(decodeBase64ToBinary(base64Str));
}

/**
 * Checks if a string is valid base64
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * @param str - String to check
 * @returns True if the string is valid base64
 */
export function isBase64(str: string): boolean {
	if (!str || str.length < 2) return false;
	// Length must be a multiple of 4, only alphabet chars + at most 2 trailing '='
	if (str.length % 4 !== 0) return false;
	return /^[A-Za-z0-9+/]+={0,2}$/.test(str);
}

/**
 * Decodes a base64 string to binary data (Uint8Array)
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * @param base64File - Base64 encoded string
 * @returns Decoded binary data as Uint8Array
 * @throws {RhinoComputeError} If base64 decoding is not supported in this environment.
 */
export function decodeBase64ToBinary(base64File: string): Uint8Array {
	// Prefer Buffer in Node — it's faster and avoids the latin-1 string detour
	// that atob + charCodeAt requires.
	if (typeof (globalThis as any).Buffer === 'function') {
		const buf = (globalThis as any).Buffer.from(base64File, 'base64');
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	if (typeof globalThis.atob === 'function') {
		const binary = globalThis.atob(base64File);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i) & 0xff;
		}
		return bytes;
	}

	throw new RhinoComputeError(
		'Base64 decoding not supported in this environment.',
		ErrorCodes.INVALID_STATE,
		{ context: { environmentInfo: 'atob or Buffer not available' } }
	);
}

/**
 * Encodes binary data (Uint8Array) to base64 string.
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * Uses Node's `Buffer` when available (faster, single allocation) and falls
 * back to `btoa` over a latin-1 string in browsers/workers.
 */
export function base64ByteArray(bytes: Uint8Array): string {
	if (typeof (globalThis as any).Buffer === 'function') {
		return (globalThis as any).Buffer.from(bytes).toString('base64');
	}
	if (typeof globalThis.btoa === 'function') {
		// Build a latin-1 string in chunks to avoid blowing the call stack on
		// large inputs (a single fromCharCode(...verylargearray) can exceed it).
		const CHUNK = 0x8000;
		let s = '';
		for (let i = 0; i < bytes.length; i += CHUNK) {
			s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
		}
		return globalThis.btoa(s);
	}
	throw new RhinoComputeError(
		'Base64 encoding not supported in this environment.',
		ErrorCodes.INVALID_STATE,
		{ context: { environmentInfo: 'btoa or Buffer not available' } }
	);
}
