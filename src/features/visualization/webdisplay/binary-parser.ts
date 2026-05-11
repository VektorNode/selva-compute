import { decodeBase64ToBinary } from '@/core/utils/encoding';
import { RhinoComputeError, ErrorCodes } from '@/core/errors';

import type { MaterialGroup, SerializableMaterial } from './types';

// ============================================================================
// WIRE FORMAT CONSTANTS
// ============================================================================

/** "SLVA" little-endian. */
export const BINARY_MESH_MAGIC = 0x41564c53;
/** Bumped on any wire-layout change. */
export const BINARY_MESH_VERSION = 1;
/** Bit 0 of the geometry flags word: 0 = int16 quantized, 1 = float32 raw. */
export const FLAG_FLOAT32 = 0x1;

const HEADER_PREAMBLE_BYTES = 4 /* magic */ + 4 /* version */ + 4; /* metadataLen */
const GEOMETRY_HEADER_BYTES =
	4 /* flags */ + 24 /* origin (3 x f64) */ + 24 /* scale (3 x f64) */ + 4; /* vertexCount */

// ============================================================================
// PARSED TYPES
// ============================================================================

/**
 * Metadata JSON embedded inside the binary blob.
 *
 * This is the same shape as a `MeshBatch` minus the `compressedData` field (the blob is opaque to
 * its own metadata header). Kept separate from the public `MeshBatch` type because the blob's
 * metadata never carries `compressedData` itself — it would be circular.
 */
export interface BinaryMeshMetadata {
	materials: SerializableMaterial[];
	groups: MaterialGroup[];
	sourceComponentId?: string;
}

/**
 * Result of parsing a binary mesh blob.
 *
 * `vertices` and `indices` are typed-array views over the original `ArrayBuffer` — zero copies.
 * The consumer is responsible for not mutating the underlying buffer if it cares about safety,
 * or for calling `.slice()` to detach.
 */
export interface ParsedBinaryMeshBatch {
	metadata: BinaryMeshMetadata;
	flags: number;
	vertices: Int16Array | Float32Array;
	indices: Uint32Array;
	origin: [number, number, number];
	scale: [number, number, number];
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parses a binary mesh batch blob in the SLVA wire format.
 *
 * The blob layout is:
 * ```
 *   [4]  magic        = "SLVA" (0x53 0x4C 0x56 0x41)
 *   [4]  version      = uint32 (currently 1)
 *   [4]  metadataLen  = uint32 byte length of UTF-8 metadata JSON
 *   [N]  metadata     = UTF-8 JSON (materials, groups, sourceComponentId, ...)
 *   [4]  flags        = uint32 (bit 0: 0 = int16 quantized, 1 = float32 raw)
 *   [24] origin       = 3 x float64
 *   [24] scale        = 3 x float64 (step per int16 unit; identity for float32)
 *   [4]  vertexCount  = uint32 number of vertices (positions = vertexCount * 3 components)
 *   [V]  vertices     = int16[vertexCount*3] OR float32[vertexCount*3]
 *   [4]  indexCount   = uint32 number of indices
 *   [I]  indices      = uint32[indexCount]
 * ```
 *
 * For int16 vertices: world position = `origin + (q + 32767) * scale`. This matches Three.js
 * `BufferAttribute(arr, 3, true)` (`normalized: true`) semantics when the per-mesh transform
 * encodes `origin + scale`.
 *
 * For float32: `origin = (0, 0, 0)`, `scale = (1, 1, 1)`, vertices are raw world positions.
 *
 * @param input - The blob, as either an `ArrayBuffer`/`Uint8Array` (binary transport) or a
 *   base64-encoded string (today's JSON-envelope transport).
 * @returns Decoded metadata plus typed-array views into the geometry payload.
 * @throws {RhinoComputeError} On invalid magic, unknown version, or truncated input.
 */
export function parseBinaryMeshBatch(
	input: ArrayBuffer | Uint8Array | string
): ParsedBinaryMeshBatch {
	const bytes = toUint8Array(input);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	if (bytes.byteLength < HEADER_PREAMBLE_BYTES) {
		throw fail('Blob too small to contain SLVA header.', {
			expectedBytes: HEADER_PREAMBLE_BYTES,
			availableBytes: bytes.byteLength
		});
	}

	let offset = 0;

	const magic = view.getUint32(offset, true);
	offset += 4;
	if (magic !== BINARY_MESH_MAGIC) {
		throw fail(`Invalid SLVA magic: 0x${magic.toString(16)}`, {
			expectedMagic: `0x${BINARY_MESH_MAGIC.toString(16)}`,
			actualMagic: `0x${magic.toString(16)}`
		});
	}

	const version = view.getUint32(offset, true);
	offset += 4;
	if (version !== BINARY_MESH_VERSION) {
		throw fail(`Unsupported SLVA version: ${version}`, {
			expectedVersion: BINARY_MESH_VERSION,
			actualVersion: version
		});
	}

	const metadataLen = view.getUint32(offset, true);
	offset += 4;
	if (offset + metadataLen > bytes.byteLength) {
		throw fail('Insufficient data to read metadata JSON.', {
			expectedBytes: metadataLen,
			availableBytes: bytes.byteLength - offset,
			offset
		});
	}

	const metadataBytes = bytes.subarray(offset, offset + metadataLen);
	offset += metadataLen;

	let metadata: BinaryMeshMetadata;
	try {
		metadata = JSON.parse(decodeUtf8(metadataBytes)) as BinaryMeshMetadata;
	} catch (error) {
		throw fail(
			`Failed to parse metadata JSON: ${error instanceof Error ? error.message : String(error)}`,
			{ metadataLen }
		);
	}

	if (offset + GEOMETRY_HEADER_BYTES > bytes.byteLength) {
		throw fail('Insufficient data to read geometry header.', {
			expectedBytes: GEOMETRY_HEADER_BYTES,
			availableBytes: bytes.byteLength - offset,
			offset
		});
	}

	const flags = view.getUint32(offset, true);
	offset += 4;

	const originX = view.getFloat64(offset, true);
	offset += 8;
	const originY = view.getFloat64(offset, true);
	offset += 8;
	const originZ = view.getFloat64(offset, true);
	offset += 8;

	const scaleX = view.getFloat64(offset, true);
	offset += 8;
	const scaleY = view.getFloat64(offset, true);
	offset += 8;
	const scaleZ = view.getFloat64(offset, true);
	offset += 8;

	const vertexCount = view.getUint32(offset, true);
	offset += 4;

	const useFloat32 = (flags & FLAG_FLOAT32) !== 0;
	const componentCount = vertexCount * 3;
	const bytesPerComponent = useFloat32 ? 4 : 2;
	const verticesByteLength = componentCount * bytesPerComponent;

	if (offset + verticesByteLength > bytes.byteLength) {
		throw fail('Insufficient data to read vertices.', {
			expectedBytes: verticesByteLength,
			availableBytes: bytes.byteLength - offset,
			offset,
			useFloat32,
			vertexCount
		});
	}

	// Typed-array views require alignment to the element size. The header lays out the geometry
	// block such that the vertex byte offset is always 4-aligned (preamble 12 + metadataLen + 4 +
	// 48 + 4). float32 needs 4-byte alignment (satisfied), int16 needs 2-byte alignment
	// (satisfied). We can take a zero-copy view as long as `bytes.byteOffset + offset` agrees with
	// that alignment in the underlying buffer — a wrapper Uint8Array could violate it. Fall back
	// to a fresh copy if so.
	const absoluteOffset = bytes.byteOffset + offset;
	const verticesView = useFloat32
		? readFloat32Vertices(bytes.buffer, absoluteOffset, componentCount)
		: readInt16Vertices(bytes.buffer, absoluteOffset, componentCount);
	offset += verticesByteLength;

	if (offset + 4 > bytes.byteLength) {
		throw fail('Insufficient data to read index count.', {
			expectedBytes: 4,
			availableBytes: bytes.byteLength - offset,
			offset
		});
	}
	const indexCount = view.getUint32(offset, true);
	offset += 4;

	const indicesByteLength = indexCount * 4;
	if (offset + indicesByteLength > bytes.byteLength) {
		throw fail('Insufficient data to read indices.', {
			expectedBytes: indicesByteLength,
			availableBytes: bytes.byteLength - offset,
			offset,
			indexCount
		});
	}

	const indicesView = readUint32Indices(bytes.buffer, bytes.byteOffset + offset, indexCount);

	return {
		metadata,
		flags,
		vertices: verticesView,
		indices: indicesView,
		origin: [originX, originY, originZ],
		scale: [scaleX, scaleY, scaleZ]
	};
}

// ============================================================================
// HELPERS
// ============================================================================

function toUint8Array(input: ArrayBuffer | Uint8Array | string): Uint8Array {
	if (typeof input === 'string') {
		return decodeBase64ToBinary(input);
	}
	if (input instanceof Uint8Array) {
		return input;
	}
	return new Uint8Array(input);
}

function decodeUtf8(bytes: Uint8Array): string {
	if (typeof TextDecoder !== 'undefined') {
		return new TextDecoder('utf-8').decode(bytes);
	}
	// Node fallback (Buffer is utf-8 by default).
	if (
		typeof (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } })
			.Buffer !== 'undefined'
	) {
		return (
			globalThis as { Buffer: { from(b: Uint8Array): { toString(enc: string): string } } }
		).Buffer.from(bytes).toString('utf-8');
	}
	throw new RhinoComputeError(
		'No UTF-8 decoder available in this environment.',
		ErrorCodes.INVALID_STATE
	);
}

function readInt16Vertices(buffer: ArrayBufferLike, byteOffset: number, count: number): Int16Array {
	if (count === 0) return new Int16Array(0);
	if (byteOffset % 2 === 0) {
		return new Int16Array(buffer, byteOffset, count);
	}
	// Misaligned (rare — would require a wrapper Uint8Array with odd byteOffset).
	const copy = new Uint8Array(count * 2);
	copy.set(new Uint8Array(buffer, byteOffset, count * 2));
	return new Int16Array(copy.buffer);
}

function readFloat32Vertices(
	buffer: ArrayBufferLike,
	byteOffset: number,
	count: number
): Float32Array {
	if (count === 0) return new Float32Array(0);
	if (byteOffset % 4 === 0) {
		return new Float32Array(buffer, byteOffset, count);
	}
	const copy = new Uint8Array(count * 4);
	copy.set(new Uint8Array(buffer, byteOffset, count * 4));
	return new Float32Array(copy.buffer);
}

function readUint32Indices(
	buffer: ArrayBufferLike,
	byteOffset: number,
	count: number
): Uint32Array {
	if (count === 0) return new Uint32Array(0);
	if (byteOffset % 4 === 0) {
		return new Uint32Array(buffer, byteOffset, count);
	}
	const copy = new Uint8Array(count * 4);
	copy.set(new Uint8Array(buffer, byteOffset, count * 4));
	return new Uint32Array(copy.buffer);
}

function fail(message: string, context: Record<string, unknown>): RhinoComputeError {
	return new RhinoComputeError(message, ErrorCodes.VALIDATION_ERROR, { context });
}
