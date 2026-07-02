import { RhinoComputeError, ErrorCodes } from '../errors';

/** Node's `Buffer` when present (faster path), else `undefined` in browsers/workers. */
function getNodeBuffer(): typeof Buffer | undefined {
	const buf = (globalThis as { Buffer?: typeof Buffer }).Buffer;
	return typeof buf === 'function' ? buf : undefined;
}

/**
 * Encodes a string to base64 (Node 20+ safe)
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * @param str - String to encode
 * @returns Base64 encoded string
 */
export function encodeStringToBase64(str: string): string {
	const Buffer = getNodeBuffer();
	if (Buffer) {
		return Buffer.from(str, 'utf-8').toString('base64');
	}
	// Browser/worker fallback: UTF-8 encode, then reuse the byte-array encoder.
	return base64ByteArray(new TextEncoder().encode(str));
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
 * Input is normalized and validated per WHATWG forgiving-base64 (whitespace
 * stripped, padding checked) BEFORE decoding, so both runtimes fail the same
 * way: without this, Node's `Buffer.from(x, 'base64')` silently decodes
 * malformed input into garbage while browser `atob` throws a bare
 * `InvalidCharacterError` DOMException.
 *
 * @param base64File - Base64 encoded string
 * @returns Decoded binary data as Uint8Array
 * @throws {RhinoComputeError} `ENCODING_ERROR` if the input is not valid
 *   base64, or `INVALID_STATE` if no decoder exists in this environment.
 */
export function decodeBase64ToBinary(base64File: string): Uint8Array {
	// Forgiving-base64 normalization: strip ASCII whitespace (wrapped /
	// pretty-printed payloads), then drop trailing padding only where the spec
	// allows it (total length a multiple of 4).
	let data = base64File.replace(/[\t\n\f\r ]/g, '');
	if (data.length % 4 === 0) data = data.replace(/={1,2}$/, '');
	if (data.length % 4 === 1 || !/^[A-Za-z0-9+/]*$/.test(data)) {
		throw new RhinoComputeError('Invalid base64 input.', ErrorCodes.ENCODING_ERROR, {
			context: { inputLength: base64File.length }
		});
	}

	// Prefer Buffer in Node — it's faster and avoids the latin-1 string detour
	// that atob + charCodeAt requires.
	const Buffer = getNodeBuffer();
	if (Buffer) {
		const buf = Buffer.from(data, 'base64');
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	if (typeof globalThis.atob === 'function') {
		const binary = globalThis.atob(data);
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
 * UTF-8 byte length of a string (what actually goes over the wire), without
 * allocating an encoded copy — `TextEncoder.encode` on a multi-MB request body
 * would double its memory just to measure it.
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 */
export function utf8ByteLength(str: string): number {
	const Buffer = getNodeBuffer();
	if (Buffer) {
		return Buffer.byteLength(str, 'utf-8');
	}
	let bytes = 0;
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		if (code < 0x80) {
			bytes += 1;
		} else if (code < 0x800) {
			bytes += 2;
		} else if (
			code >= 0xd800 &&
			code <= 0xdbff &&
			i + 1 < str.length &&
			(str.charCodeAt(i + 1) & 0xfc00) === 0xdc00
		) {
			// Surrogate pair → one 4-byte code point; lone surrogates fall through
			// to 3 bytes (the replacement-character encoding TextEncoder emits).
			bytes += 4;
			i++;
		} else {
			bytes += 3;
		}
	}
	return bytes;
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
	const Buffer = getNodeBuffer();
	if (Buffer) {
		return Buffer.from(bytes).toString('base64');
	}
	if (typeof globalThis.btoa === 'function') {
		// Build a latin-1 string in chunks to avoid blowing the call stack on
		// large inputs (a single fromCharCode(...verylargearray) can exceed it).
		const CHUNK = 0x8000;
		let s = '';
		for (let i = 0; i < bytes.length; i += CHUNK) {
			// A Uint8Array subarray is array-like, so pass it straight to
			// fromCharCode.apply — no need to copy it into a plain Array first.
			s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
		}
		return globalThis.btoa(s);
	}
	throw new RhinoComputeError(
		'Base64 encoding not supported in this environment.',
		ErrorCodes.INVALID_STATE,
		{ context: { environmentInfo: 'btoa or Buffer not available' } }
	);
}
