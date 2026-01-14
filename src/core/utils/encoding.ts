/**
 * Encodes a string to base64 (Node 20+ safe)
 *
 * @internal Internal encoding helper — kept internal to `selva-compute`.
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
 * @internal Internal encoding helper — kept internal to `selva-compute`.
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
 * @internal Internal encoding helper — kept internal to `selva-compute`.
 *
 * @param str - String to check
 * @returns True if the string is valid base64
 */
export function isBase64(str: string): boolean {
	if (!str || str.trim().length === 0) return false;
	try {
		return Buffer.from(str, 'base64').toString('base64') === str;
	} catch {
		return false;
	}
}


/**
 * Decodes a base64 string to binary data (Uint8Array)
 *
 * @internal Internal encoding helper — kept internal to `selva-compute`.
 *
 * @param base64File - Base64 encoded string
 * @returns Decoded binary data as Uint8Array
 * @throws {RhinoComputeError} If base64 decoding is not supported in this environment.
 */
export function decodeBase64ToBinary(base64File: string): Uint8Array {
	if (typeof globalThis.atob === 'function') {
		return Uint8Array.from(globalThis.atob(base64File), (c) => c.charCodeAt(0));
	}
	if (typeof (globalThis as any).Buffer === 'function') {
		// Buffer.from returns a Uint8Array-compatible Buffer
		return (globalThis as any).Buffer.from(base64File, 'base64');
	}

	// Import here to avoid circular dependencies at top level
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { RhinoComputeError, ErrorCodes } = require('./../../core/errors');
	throw new RhinoComputeError(
		'Base64 decoding not supported in this environment.',
		ErrorCodes.INVALID_STATE,
		{ context: { environmentInfo: 'atob or Buffer not available' } }
	);
}

/**
 * Encodes binary data (Uint8Array) to base64 string
 *
 * @internal Internal encoding helper — kept internal to `selva-compute`.
 *
 * Source: https://github.com/mcneel/compute.rhino3d.appserver/blob/92c95a3b1d076a4d4a5360214ffd27c46425ff03/src/examples/convert/scriptjs
 * https://gist.github.com/jonleighton/958841
 *
 * MIT LICENSE
 * Copyright 2011 Jon Leighton
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
export function base64ByteArray(bytes: Uint8Array | null | undefined): string {
	if (bytes === null || bytes === undefined) {
		// Import here to avoid circular dependencies at top level
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { RhinoComputeError, ErrorCodes } = require('./../../core/errors');
		throw new RhinoComputeError(
			'Input bytes must not be null or undefined',
			ErrorCodes.INVALID_INPUT,
			{ context: { receivedValue: bytes } }
		);
	}

	const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	let inputBytes = bytes;

	// strip bom (Byte Order Mark)
	if (
		inputBytes.length >= 3 &&
		inputBytes[0] === 239 &&
		inputBytes[1] === 187 &&
		inputBytes[2] === 191
	) {
		inputBytes = inputBytes.slice(3);
	}

	const byteLength = inputBytes.byteLength;
	const byteRemainder = byteLength % 3;
	const mainLength = byteLength - byteRemainder;

	let base64 = '';
	let a, b, c, d;
	let chunk;

	// Main loop deals with bytes in chunks of 3
	for (let i = 0; i < mainLength; i += 3) {
		// Combine the three bytes into a single integer

		const byte1 = inputBytes[i] !== undefined ? inputBytes[i] : 0;
		const byte2 = inputBytes[i + 1] !== undefined ? inputBytes[i + 1] : 0;
		const byte3 = inputBytes[i + 2] !== undefined ? inputBytes[i + 2] : 0;

		const innerChunk = (byte1 << 16) | (byte2 << 8) | byte3;

		// Use bitmasks to extract 6-bit segments from the triplet
		a = (innerChunk & 16515072) >> 18;
		b = (innerChunk & 258048) >> 12;
		c = (innerChunk & 4032) >> 6;
		d = innerChunk & 63;

		// Convert the raw binary segments to the appropriate ASCII encoding
		if (typeof encodings !== 'string') {
			throw new Error('encodings must be a string');
		}

		if (typeof a !== 'number' || a < 0 || a >= encodings.length) {
			throw new Error('Invalid index a');
		}

		if (typeof b !== 'number' || b < 0 || b >= encodings.length) {
			throw new Error('Invalid index b');
		}

		if (typeof c !== 'number' || c < 0 || c >= encodings.length) {
			throw new Error('Invalid index c');
		}

		if (typeof d !== 'number' || d < 0 || d >= encodings.length) {
			throw new Error('Invalid index d');
		}

		const charA = encodings[a];
		const charB = encodings[b];
		const charC = encodings[c];
		const charD = encodings[d];

		if (charA === undefined || charB === undefined || charC === undefined || charD === undefined) {
			throw new Error('Invalid encoding index');
		}

		base64 += charA + charB + charC + charD;
	}

	// Deal with the remaining bytes and padding
	if (byteRemainder === 1) {
		chunk = inputBytes[mainLength];

		if (chunk === undefined) {
			throw new Error("'chunk' must not be undefined");
		}

		a = (chunk & 252) >> 2;
		b = (chunk & 3) << 4;

		const charA = encodings[a];
		const charB = encodings[b];

		if (charA === undefined || charB === undefined) {
			throw new Error('Invalid encoding index');
		}

		base64 += `${charA + charB}==`;
	} else if (byteRemainder === 2) {
		const byte1 = inputBytes[mainLength] ?? 0;
		const byte2 = inputBytes[mainLength + 1] !== undefined ? inputBytes[mainLength + 1] : 0;

		if (
			typeof byte1 !== 'number' ||
			byte1 < 0 ||
			byte1 > 255 ||
			typeof byte2 !== 'number' ||
			byte2 < 0 ||
			byte2 > 255
		) {
			throw new Error('Invalid byte1');
		}

		chunk = (byte1 << 8) | byte2;

		a = (chunk & 64512) >> 10;
		b = (chunk & 1008) >> 4;
		c = (chunk & 15) << 2;

		const charA = encodings[a];
		const charB = encodings[b];
		const charC = encodings[c];

		if (charA === undefined || charB === undefined || charC === undefined) {
			throw new Error('Invalid encoding index');
		}

		base64 += `${charA + charB + charC}=`;
	}

	return base64;
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
	// Import here to avoid circular dependencies at top level
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { getLogger } = require('./logger');

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
