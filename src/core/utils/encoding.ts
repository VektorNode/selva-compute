import { RhinoComputeError, ErrorCodes } from '../errors';
import { getLogger } from './logger';

/**
 * Encodes a string to base64 (Node 20+ safe)
 *
 * @internal Internal encoding helper — kept internal to `@selvajs/compute`.
 *
 * @param str - String to encode
 * @returns Base64 encoded string
 */
export function encodeStringToBase64(str: string): string {
	return Buffer.from(str, 'utf-8').toString('base64');
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
	return Buffer.from(base64Str, 'base64').toString('utf-8');
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

/**
 * Convert base64 string to rhino object
 *
 * @internal Internal helper for decoding Rhino objects — not public API.
 *
 * Source: https://github.com/mcneel/compute.rhino3d.appserver/blob/92c95a3b1d076a4d4a5360214ffd27c46425ff03/src/examples/convert/scriptjs
 * @param rhino is the rhino module form rhino3dm. Since not properly typed its not used here.
 * @param item
 * @returns
 */
export function base64ToRhinoObject(
	rhino: any,
	item: {
		type: string;
		data: string;
	}
) {
	//Make a type definition for this?
	let decodata: null | object = null;
	try {
		decodata = JSON.parse(item.data);
	} catch (error) {
		decodata = item;
		getLogger().warn('Failed to parse JSON, returning original data:', error, item);
	}
	if (item.type === 'System.String') {
		try {
			return rhino.DracoCompression.decompressBase64String(decodata);
		} catch (error) {
			getLogger().error('Failed to decompress Draco base64 string:', error);
		}
	} else if (
		typeof decodata === 'object' &&
		Object.prototype.hasOwnProperty.call(decodata, 'opennurbs')
	) {
		return rhino.CommonObject.decode(decodata);
	} else if (typeof decodata === 'object') {
		try {
			return rhino.CommonObject.decode(decodata);
		} catch (error) {
			getLogger().error('Failed to decode Rhino object:', error);
		}
	}
}
